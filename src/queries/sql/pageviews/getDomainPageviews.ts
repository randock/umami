import { EVENT_TYPE } from '@/lib/constants';
import prisma from '@/lib/prisma';

export interface DomainPageviews {
  domains: string;
  pageviews: number;
}

export async function getDomainPageviews(): Promise<DomainPageviews[]> {
  const { rawQuery } = prisma;

  return rawQuery(
    `
    select
      string_agg(sub.name, ',') as domains,
      sub.pageviews
    from (
      select
        website.name,
        count(website_event.event_id)::int as pageviews
      from website_event
        inner join website on website.website_id = website_event.website_id
      where website_event.created_at between now() - interval '30 days' and now()
        and website_event.event_type = {{eventType}}
        and website.deleted_at is null
      group by website.website_id, website.name
    ) sub
    group by sub.pageviews
    order by sub.pageviews desc
    `,
    { eventType: EVENT_TYPE.pageView },
  );
}
