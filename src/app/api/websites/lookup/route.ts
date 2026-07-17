import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json, notFound, unauthorized } from '@/lib/response';
import { canViewAllWebsites } from '@/permissions';
import { getWebsiteByDomain } from '@/queries/prisma/website';

export async function GET(request: Request) {
  const schema = z.object({
    domain: z.string().min(1).max(500),
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  if (!(await canViewAllWebsites(auth))) {
    return unauthorized();
  }

  const website = await getWebsiteByDomain(query.domain);

  if (!website) {
    return notFound();
  }

  return json(website);
}
