"""Voice endpoint tests with a mocked upstream, not synthesized recordings."""
import http.client
import importlib.util
import io
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('xingban_voice', Path(__file__).resolve().parents[1] / 'server/chat_api.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class VoiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = api.ThreadingHTTPServer(('127.0.0.1', 0), api.ChatHandler)
        cls.worker = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.worker.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.worker.join(timeout=2)

    def setUp(self):
        api._rate_buckets.clear()

    def post(self, payload):
        conn = http.client.HTTPConnection(*self.server.server_address)
        conn.request('POST', '/api/voice', json.dumps(payload), {'Content-Type': 'application/json'})
        response = conn.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        conn.close()
        return result

    def test_real_payload_uses_authorized_voice_and_watermark(self):
        result = {'base_resp': {'status_code': 0}, 'data': {'audio': '494433040000'}}
        with patch.dict(api.os.environ, {'MINIMAX_API_KEY': 'unit-test-only'}), patch.object(
            api.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps(result).encode())
        ) as upstream:
            status, headers, audio = self.post({'text': '今天过得怎么样？', 'starId': {}, 'voiceId': 'untrusted'})
        self.assertEqual(status, 200)
        payload = json.loads(upstream.call_args.args[0].data)
        self.assertEqual(payload['voice_setting']['voice_id'], api.VOICE_PROFILES['xingyao'][0])
        self.assertEqual(payload['voice_setting']['speed'], 1)
        self.assertNotIn('emotion', payload['voice_setting'])
        self.assertTrue(payload['aigc_watermark'])
        self.assertEqual(payload['text'], '今天过得怎么样？')
        self.assertEqual(headers['X-Xingban-Voice-ID'], api.VOICE_PROFILES['xingyao'][0])
        self.assertEqual(headers['X-AI-Generated'], 'true')
        self.assertEqual(audio, bytes.fromhex('494433040000'))

    def test_errors_never_return_empty_audio_or_fallback(self):
        for result in [
            {'base_resp': {'status_code': 20132}},
            {'base_resp': {'status_code': 0}, 'data': {'audio': ''}},
            {'base_resp': {'status_code': 0}, 'data': {'audio': 'not hex'}},
        ]:
            with patch.dict(api.os.environ, {'MINIMAX_API_KEY': 'unit-test-only'}), patch.object(
                api.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps(result).encode())
            ) as upstream:
                self.assertEqual(self.post({'text': '测试'})[0], 502)
                self.assertEqual(upstream.call_count, 1)

    def test_missing_text_is_rejected(self):
        with patch.object(api.urllib.request, 'urlopen') as upstream:
            for payload in [None, [], {}, {'text': '  '}]:
                self.assertEqual(self.post(payload)[0], 400)
            upstream.assert_not_called()


if __name__ == '__main__':
    unittest.main()
