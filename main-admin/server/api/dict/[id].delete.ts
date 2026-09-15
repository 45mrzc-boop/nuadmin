import { numArg, numId } from '../_lib'

/**
 * 删字典。有字段在引用时默认拒绝 —— 静默删掉会让那些字段的下拉变成空列表，
 * 而生成期又查不出为什么，属于最难查的那类问题。确认要删传 force=1。
 */
export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/dict', 'write')
  const id = numId(event)
  const force = numArg(event, 'force', 0) === 1
  const t = await one<Record<string, any>>(`SELECT * FROM dict_type WHERE id=?`, [id])
  if (!t) return ok({ deleted: 0 })

  const used = await q<{ n: number }>(
    `SELECT COUNT(*) n FROM module_field f JOIN module m ON m.id=f.module_id
     WHERE m.tenant_id=? AND f.dict_key=?`, [t.tenant_id, t.dict_key])
  const n = Number(used[0]?.n ?? 0)
  if (n > 0 && !force) {
    throw createError({
      statusCode: 409,
      message: `字典「${t.dict_key}」还被 ${n} 个字段引用着，删掉它们的下拉会空。确认要删请传 force=1`
    })
  }

  await tx(async conn => {
    await conn.execute(`DELETE FROM dict_item WHERE type_id=?`, [id])
    await conn.execute(`DELETE FROM dict_type WHERE id=?`, [id])
  })
  return ok({ deleted: 1, clearedFields: n })
})
