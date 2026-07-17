import Papa from 'papaparse';
import { parseRequest } from '@/lib/request';
import { unauthorized } from '@/lib/response';
import { canViewAllWebsites } from '@/permissions';
import { getDomainPageviews } from '@/queries/sql';

export async function GET(request: Request) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  if (!(await canViewAllWebsites(auth))) {
    return unauthorized();
  }

  const data = await getDomainPageviews();

  const csv = Papa.unparse(data, { header: true });

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv',
      'content-disposition': 'attachment; filename="pageviews.csv"',
    },
  });
}
