import { moduleWithFields, numId } from '../_lib'

export default defineAuthed(async (event) => ok(await moduleWithFields(numId(event))))
