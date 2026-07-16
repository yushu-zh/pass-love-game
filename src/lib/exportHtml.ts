import type { ExportPayload } from '../types'

// 匹配真正的数据脚本块（同时含 id="diary-data" 与 type="application/json"，属性顺序不限）。
// 用先行断言确保不误命中注释里提到的 <script id="diary-data"> 文本。
const DIARY_DATA_RE =
  /(<script(?=[^>]*\bid="diary-data")(?=[^>]*\btype="application\/json")[^>]*>)([\s\S]*?)(<\/script>)/

/**
 * 用 `payload` 替换 `template` 中 `<script id="diary-data" type="application/json">…</script>`
 * 数据块，返回可直接下载的完整 HTML 字符串。纯函数。
 */
export function buildDiaryHtml(template: string, payload: ExportPayload): string {
  const json = JSON.stringify(payload, null, 2)
  return template.replace(DIARY_DATA_RE, (_m, open: string, _body: string, close: string) => {
    return `${open}\n${json}\n${close}`
  })
}
