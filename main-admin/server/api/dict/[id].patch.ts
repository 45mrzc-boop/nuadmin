import { asText, assertIdent, bodyOf, dictTypeView, numId } from '../_lib'

/** 改字典编码会连带影响引用：所有 module_field.dict_key 同步改掉，否则建模站的引用会静默失联。 */
export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/dict', 'write')
  const id = numId(event)
  const t = await one<Record<string, any>>(`SELECT * FROM dict_type WHERE id=?`, [id])
  if (!t) throw createError({ statusCode: 404, message: `字典 #${id} 不存在` })

  const body = await bodyOf(event)
  const sets: string[] = []
  const args: unknown[] = []
  let newKey = t.dict_key as string

  if (body.dictKey !== undefined || body.dict_key !== undefined) {
    const key = assertIdent(asText(body.dictKey ?? body.dict_key, 64), '字典编码 dictKey', true)
    if (key !== t.dict_key) {
      const dup = await one(`SELECT id FROM dict_type WHERE tenant_id=? AND dict_key=? AND id<>?`, [t.tenant_id, key, id])
      if (dup) throw createError({ statusCode: 409, message: `字典编码「${key}」已被另一个字典占用` })
      newKey = key
      // 字段引用跟着走，否则改完名所有引用它的字段都变成"未定义"。
      await run(`UPDATE module_field f JOIN module m ON m.id=f.module_id
                 SET f.dict_key=? WHERE m.tenant_id=? AND f.dict_key=?`, [key, t.tenant_id, t.dict_key])
    }
    sets.push('dict_key=?')
    args.push(key)
  }
  if (body.name !== undefined) {
    const name = asText(body.name, 64)
    if (!name) throw createError({ statusCode: 400, message: '字典名称 name 不能为空' })
    sets.push('name=?')
    args.push(name)
  }
  if (body.remark !== undefined) {
    sets.push('remark=?')
    args.push(asText(body.remark, 255))
  }
  if (!sets.length) throw createError({ statusCode: 400, message: '没有需要更新的内容，可更新 dictKey / name / remark' })

  await run(`UPDATE dict_type SET ${sets.join(', ')} WHERE id=?`, [...args, id])
  const items = await q<Record<string, any>>(`SELECT * FROM dict_item WHERE type_id=? ORDER BY sort, id`, [id])
  const row = await one<Record<string, any>>(`SELECT * FROM dict_type WHERE id=?`, [id])
  return ok({ ...dictTypeView(row!, items), newKey })
})
