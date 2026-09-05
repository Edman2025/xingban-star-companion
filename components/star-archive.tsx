const photoSource = 'https://commons.wikimedia.org/wiki/File:Zhao_Lusi_in_2023_(1).jpg';
const dataSource = 'https://www.wikidata.org/wiki/Q55697066';
const linkStyle = 'underline underline-offset-4 hover:text-blue-700 focus-visible:outline focus-visible:outline-2';

export function StarArchive({ compact = false }: { compact?: boolean }) {
  return (
    <section aria-label="赵露思影像与资料" className="space-y-5">
      <p className="text-sm leading-6 text-slate-500">历史资料，非实时官宣 · 资料核对：2026-09-06</p>
      <div className="grid gap-5 md:grid-cols-2">
        <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <img src="/zhao-lusi-bulgari-2023-ccby3.jpg" alt="赵露思在2023年宝格丽活动上手持话筒" width={429} height={623} loading="lazy" className={`w-full bg-[#f2e3d8] object-contain ${compact ? 'h-64' : 'max-h-[560px]'}`} />
          <figcaption className="space-y-2 p-5">
            <p className="text-sm font-semibold text-[#b47720]"><time dateTime="2023-04-25">2023 年 4 月 25 日</time> · 活动影像</p>
            <h2 className="text-xl font-bold text-[#17213f]">赵露思 · 宝格丽活动</h2>
            <p className="text-base leading-7 text-slate-600">这张历史活动照片收录于 Wikimedia Commons。活动名称和日期依据文件说明页，不代表近期行程。</p>
            <p className="text-xs leading-6 text-slate-500">作者：Play大明星；Commons 版本由 Nkon21 调亮。本站未进一步修改图片。<br />
              <a className={linkStyle} href={photoSource} target="_blank" rel="noopener noreferrer">图片来源</a> · <a className={linkStyle} href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">CC BY 3.0 许可</a>
            </p>
          </figcaption>
        </figure>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <p className="text-sm font-semibold text-[#b47720]">人物资料 · Wikidata</p>
          <h2 className="mt-2 text-2xl font-black text-[#17213f]">趙露思 <span className="text-base font-medium text-slate-500">Zhao Lusi</span></h2>
          <dl className="mt-6 divide-y divide-slate-100 text-base">
            {[
              ['别名', 'Rosy Zhao / Lusi Zhao'],
              ['出生日期', '1998 年 11 月 9 日'],
              ['出生地', '四川（按数据源记录）'],
              ['职业', '演员、歌手、模特'],
            ].map(([label, value]) => <div key={label} className="grid grid-cols-[5em_minmax(0,1fr)] gap-3 py-4"><dt className="text-slate-500">{label}</dt><dd className="break-words font-medium text-[#17213f]">{value}</dd></div>)}
          </dl>
          <p className="mt-6 text-sm leading-7 text-slate-500">以上为开放资料快照，可能存在遗漏或后续修订；不包含私人信息、实时行程或微博内容。</p>
          <p className="mt-4 text-sm leading-7 text-slate-500"><a className={linkStyle} href={dataSource} target="_blank" rel="noopener noreferrer">资料来源：Wikidata Q55697066</a><br /><a className={linkStyle} href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener noreferrer">结构化数据许可：CC0</a></p>
        </article>
      </div>
      {!compact && <p className="rounded-2xl bg-blue-50 p-5 text-sm leading-7 text-blue-900">本栏目为非官方资料整理，照片与资料直接在站内展示；来源链接仅供核查。图片许可不代表艺人、摄影作者或品牌为星伴背书。本版未接入每日自动更新，不把历史资料标为最新消息。</p>}
    </section>
  );
}
