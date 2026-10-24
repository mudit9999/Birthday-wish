import { CARD_MIME_TYPES } from '@family-wishes/core'
import { getCard } from '@family-wishes/db'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/guards'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = () => new Response(null, { status: 404 })

/** The draft's greeting card image, for the admin only. */
export async function GET(_request: Request, ctx: RouteContext<'/admin/drafts/[id]/card'>) {
  await requireAdmin()
  const { id } = await ctx.params
  if (!UUID.test(id)) return notFound()
  const card = await getCard(await getDb(), id)
  if (!card || !(CARD_MIME_TYPES as readonly string[]).includes(card.mimeType)) return notFound()
  return new Response(new Uint8Array(card.data), {
    headers: {
      'Content-Type': card.mimeType,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}
