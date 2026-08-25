import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json, badRequest, unauthorized } from '@/lib/response';
import { canViewAllWebsites } from '@/permissions';
import { getVisitorActivity } from '@/queries/sql/visitors/getVisitorActivity';

const commaSeparated = (value?: string) =>
  (value ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = z.object({
    // optional: the point of the endpoint is a visitor's whole history, and
    // any default here would silently truncate it
    startAt: z.coerce.number().int().optional(),
    endAt: z.coerce.number().int().optional(),
    distinctId: z.string().optional(),
    sessionId: z.string().optional(),
    interestEvent: z.string().optional(),
    pageLimit: z.coerce.number().int().positive().max(1000).optional(),
    eventLimit: z.coerce.number().int().positive().max(1000).optional(),
    websiteLimit: z.coerce.number().int().positive().max(500).optional(),
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  // the response reaches beyond this website, to the others the same visitor
  // has been seen on, so a share token is deliberately not enough
  if (!(await canViewAllWebsites(auth))) {
    return unauthorized();
  }

  const distinctIds = commaSeparated(query.distinctId);
  const sessionIds = commaSeparated(query.sessionId);

  // without a key every session would match, which is the whole website
  if (distinctIds.length === 0 && sessionIds.length === 0) {
    return badRequest({ message: 'A distinctId or sessionId is required.' });
  }

  const data = await getVisitorActivity(websiteId, {
    distinctIds,
    sessionIds,
    startDate: query.startAt !== undefined ? new Date(query.startAt) : undefined,
    endDate: query.endAt !== undefined ? new Date(query.endAt) : undefined,
    interestEvents: commaSeparated(query.interestEvent),
    pageLimit: query.pageLimit ?? 500,
    eventLimit: query.eventLimit ?? 500,
    websiteLimit: query.websiteLimit ?? 100,
  });

  return json(data);
}
