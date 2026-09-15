import { asText, bodyOf, numOf } from '../_lib'
import { deriveIdent } from '../ai/_nlu'

/**
 * 字段表单的「自动填充」：中文标签 -> 英文列名。
 *
 * 词表和去重规则直接复用 AI 建表那条路径（`deriveIdent`），
 * 两个入口必须给同一个名字，否则建模站填出来的列名会和 AI 生成的对不上。
 * taken 由服务端按同模块已有列名算，不信任前端传的形状。
 */
export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/model/:id', 'read')
  const body = await bodyOf(event)
  const label = asText(body.label ?? body.name, 64)
  if (!label) throw createError({ statusCode: 400, message: '缺少 label（要翻译的中文名）' })

  const taken: string[] = []
  const moduleId = numOf(body.moduleId ?? body.module_id, 0)
  if (moduleId > 0) {
    const rows = await q<{ col_key: string }>(`SELECT col_key FROM module_field WHERE module_id=?`, [moduleId])
    taken.push(...rows.map(r => r.col_key))
  }

  const { key, matched } = deriveIdent(label, taken)
  return ok({
    key,
    matched,
    hint: matched ? '' : `词表里没有「${label}」的对应词，先给了短哈希名，建议手填英文`
  })
})
