"""Community API integration tests against isolated, persistent SQLite storage."""
import base64
import concurrent.futures
import http.client
import importlib.util
import json
import tempfile
import threading
import unittest
import uuid
from pathlib import Path

spec = importlib.util.spec_from_file_location("community_api", Path(__file__).parents[1] / "server/community_api.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
JPEG = "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAACqADAAQAAAABAAAAEAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAEAAKAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A/WX4geJtV0P4o+Drdbl0024EySW8T4aeWTCqSgIyqDnn8Oa93rA1TThcanpl+qKz2rt95Nx2sMcHtW/Xnwcry5krdPuW+v8AketX9nyQ5L3trr1u9tF07tn/2Q=="
ORIGIN = "https://xingban.xunlian.co"


class CommunityTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.server = api.make_server(("127.0.0.1", 0), self.tmp.name)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_port
        self.token = self.call("POST", "/session", {})[1]["token"]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def call(self, method, path="", body=None, token=None, origin=ORIGIN, raw=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        request_headers = {"Origin": origin, "Content-Type": "application/json"}
        if token:
            request_headers["Authorization"] = "Bearer " + token
        if headers:
            request_headers.update(headers)
        encoded = raw if raw is not None else json.dumps(body).encode() if body is not None else None
        connection.request(method, "/api/community" + path, body=encoded, headers=request_headers)
        response = connection.getresponse()
        data = response.read()
        result = data if response.getheader("Content-Type", "").startswith("image/") else json.loads(data)
        status = response.status
        connection.close()
        return status, result

    def payload(self, **kwargs):
        return dict({"requestId": str(uuid.uuid4()), "author": "测试星友", "text": "第一行\n第二行 <script>alert(1)</script>", "tag": "日常分享", "images": []}, **kwargs)

    def publish(self, **kwargs):
        return self.call("POST", "/posts", self.payload(**kwargs), self.token)

    def test_empty_feed_is_real_not_seeded(self):
        self.assertEqual(self.call("GET")[1], {"posts": [], "total": 0, "nextCursor": None})

    def test_text_survives_new_store_and_has_authorized_ownership(self):
        status, data = self.publish()
        self.assertEqual(status, 201)
        self.assertTrue(data["post"]["mine"])
        self.assertEqual(data["post"]["likes"], 0)
        self.assertNotIn("owner", data["post"])
        self.assertNotIn(self.token, json.dumps(data))
        self.server.store = api.CommunityStore(self.tmp.name)
        public = self.call("GET")[1]["posts"][0]
        self.assertFalse(public["mine"])
        self.assertEqual(public["text"], self.payload()["text"])
        mine = self.call("GET", "?scope=mine", token=self.token)[1]
        self.assertEqual(mine["total"], 1)

    def test_images_are_shared_in_order_and_survive_restart(self):
        status, data = self.publish(images=[JPEG, JPEG], text="")
        self.assertEqual(status, 201)
        urls = data["post"]["images"]
        self.assertEqual(len(urls), 2)
        self.assertNotEqual(*urls)
        self.server.store = api.CommunityStore(self.tmp.name)
        for url in urls:
            status, image = self.call("GET", url.removeprefix("/api/community"))
            self.assertEqual(status, 200)
            self.assertEqual(image, base64.b64decode(JPEG))

    def test_repeat_or_concurrent_publish_is_idempotent(self):
        body = self.payload(images=[JPEG])
        def send(_):
            return self.call("POST", "/posts", body, self.token)
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(send, range(4)))
        self.assertTrue(all(result[0] == 201 for result in results), results)
        self.assertEqual(len({result[1]["post"]["id"] for result in results}), 1)
        self.assertEqual(self.call("GET")[1]["total"], 1)
        self.assertEqual(len(list(self.server.store.images.iterdir())), 1)

    def test_another_visitor_cannot_delete(self):
        post_id = self.publish()[1]["post"]["id"]
        other = self.call("POST", "/session", {})[1]["token"]
        self.assertEqual(self.call("DELETE", f"/posts/{post_id}", token=other)[0], 404)
        self.assertEqual(self.call("DELETE", f"/posts/{post_id}")[0], 401)
        self.assertEqual(self.call("GET", "?scope=mine", token=other)[1]["posts"], [])
        self.assertEqual(self.call("GET")[1]["total"], 1)

    def test_delete_hides_post_and_media_but_is_recoverable(self):
        body = self.payload(images=[JPEG])
        post = self.call("POST", "/posts", body, self.token)[1]["post"]
        self.assertEqual(self.call("DELETE", f'/posts/{post["id"]}', token=self.token)[0], 200)
        self.assertEqual(self.call("GET")[1]["total"], 0)
        self.assertEqual(self.call("GET", post["images"][0].removeprefix("/api/community"))[0], 404)
        self.assertEqual(self.call("POST", "/posts", body, self.token)[0], 409)
        self.assertEqual(len(list(self.server.store.images.iterdir())), 1)

    def test_likes_are_persistent_idempotent_and_per_visitor(self):
        post_id = self.publish()[1]["post"]["id"]
        path = f"/posts/{post_id}/like"
        for _ in range(2):
            self.assertEqual(self.call("POST", path, {"liked": True}, self.token)[1]["likes"], 1)
        other = self.call("POST", "/session", {})[1]["token"]
        self.assertEqual(self.call("POST", path, {"liked": True}, other)[1]["likes"], 2)
        self.server.store = api.CommunityStore(self.tmp.name)
        self.assertTrue(self.call("GET", token=self.token)[1]["posts"][0]["liked"])
        self.assertEqual(self.call("POST", path, {"liked": False}, self.token)[1]["likes"], 1)
        self.assertEqual(self.call("POST", path, {"liked": "true"}, self.token)[0], 400)

    def test_invalid_text_nickname_topic_and_media_are_rejected(self):
        cases = [
            {"text": "  "}, {"text": "字" * 2001}, {"author": "a"},
            {"author": "赵露思工作室"}, {"author": "系统管理员"}, {"author": ["fake"]},
            {"tag": "<script>"}, {"tag": []}, {"images": [JPEG] * 10},
            {"images": ["<svg onload=alert(1)>"]}, {"images": [base64.b64encode(b"<html>no</html>").decode()]},
            {"images": ["a" * (api.MAX_IMAGE * 2)]}, {"images": [JPEG, "broken"]},
            {"requestId": "../unsafe"}, {"text": None}
        ]
        for values in cases:
            with self.subTest(values=list(values)):
                self.assertIn(self.publish(**values)[0], (400, 413))
        self.assertEqual(self.call("GET")[1]["total"], 0)
        self.assertEqual(list(self.server.store.images.iterdir()), [])

    def test_auth_origin_json_and_size_limits(self):
        self.assertEqual(self.call("POST", "/posts", self.payload())[0], 401)
        self.assertEqual(self.call("POST", "/posts", self.payload(), "forged")[0], 401)
        self.assertEqual(self.call("POST", "/posts", self.payload(), self.token, origin="https://evil.example")[0], 403)
        self.assertEqual(self.call("POST", "/posts", token=self.token, raw=b"not-json")[0], 400)
        self.assertEqual(self.call("POST", "/posts", [], self.token)[0], 400)
        self.assertEqual(self.call("POST", "/posts", self.payload(), self.token, headers={"Content-Type": "text/html"})[0], 415)
        self.assertEqual(self.call("POST", "/posts", self.payload(), self.token, headers={"Content-Length": str(api.MAX_BODY + 1)})[0], 413)
        self.assertEqual(self.call("OPTIONS", origin="https://evil.example")[0], 403)

    def test_bad_filters_and_path_traversal(self):
        for path in ["?scope=invalid", "?tag=invalid", "?cursor=abc", "?cursor=-1", "?cursor=" + "9" * 100]:
            self.assertEqual(self.call("GET", path)[0], 400)
        self.assertEqual(self.call("GET", "/images/../../community.sqlite3")[0], 404)

    def test_post_rate_limit_keeps_existing_data(self):
        for _ in range(3):
            self.assertEqual(self.publish()[0], 201)
        self.assertEqual(self.publish()[0], 429)
        self.assertEqual(self.call("GET")[1]["total"], 3)

    def test_pagination_and_topic_filters(self):
        with self.server.store.connect() as db:
            owner = self.server.store.owner("Bearer " + self.token, True)
            for number in range(25):
                db.execute("INSERT INTO posts(owner, request_id, name, text, tag, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                           (owner, str(uuid.uuid4()), "测试星友", str(number), "作品讨论" if number % 2 else "日常分享", 1))
        first = self.call("GET")[1]
        second = self.call("GET", "?cursor=" + str(first["nextCursor"]))[1]
        self.assertEqual(len(first["posts"]), 20)
        self.assertEqual(len(second["posts"]), 5)
        self.assertFalse({p["id"] for p in first["posts"]} & {p["id"] for p in second["posts"]})
        self.assertIsNone(second["nextCursor"])
        self.assertEqual(self.call("GET", "?tag=%E4%BD%9C%E5%93%81%E8%AE%A8%E8%AE%BA")[1]["total"], 12)


if __name__ == "__main__":
    unittest.main()
