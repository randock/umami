import * as yup from 'yup';
import { useAuth, useCors, useValidate } from 'lib/middleware';
import { getRequestFilters, getRequestDateRange } from 'lib/request';
import { NextApiRequestQueryBody, WebsitePageviews } from 'lib/types';
import { NextApiResponse } from 'next';
import { methodNotAllowed, ok, unauthorized } from 'next-basics';
import { getPageviewStats, getUserWebsites } from 'queries';
import { TimezoneTest, UnitTypeTest } from 'lib/yup';

export interface WebsitePageviewRequestQuery {
  websiteId: string;
  startAt: number;
  endAt: number;
  unit?: string;
  timezone?: string;
  url?: string;
  referrer?: string;
  title?: string;
  host?: string;
  os?: string;
  browser?: string;
  device?: string;
  country?: string;
  region: string;
  city?: string;
  tag?: string;
  compare?: string;
}

const schema = {
  GET: yup.object().shape({
    page: yup.number().integer().min(1).required(),
    pageSize: yup.number().integer().positive().min(1).required(),
    startAt: yup.number().required(),
    endAt: yup.number().required(),
    unit: UnitTypeTest,
    timezone: TimezoneTest,
    url: yup.string(),
    referrer: yup.string(),
    title: yup.string(),
    host: yup.string(),
    os: yup.string(),
    browser: yup.string(),
    device: yup.string(),
    country: yup.string(),
    region: yup.string(),
    city: yup.string(),
    tag: yup.string(),
    compare: yup.string(),
  }),
};

export default async (
  req: NextApiRequestQueryBody<WebsitePageviewRequestQuery>,
  res: NextApiResponse<WebsitePageviews>,
) => {
  await useCors(req, res);
  await useAuth(req, res);
  await useValidate(schema, req, res);

  const { timezone } = req.query;

  if (req.method === 'GET') {
    const { user } = req.auth;

    if (!user.isAdmin) {
      return unauthorized(res);
    }

    const { page, pageSize } = req.query;

    const websites = await getUserWebsites(user.id, {
      page: +page,
      pageSize: +pageSize,
    });

    const { startDate, endDate, unit } = await getRequestDateRange(req);
    const filters = {
      ...getRequestFilters(req),
      startDate,
      endDate,
      timezone,
      unit,
    };

    const output = {
      websites: [],
    };

    for (const website of websites.data) {
      const pageviews = await getPageviewStats(website.id, filters);
      output.websites.push({
        id: website.id,
        name: website.name,
        pageviews,
      });
    }

    return ok(res, output);
  }

  return methodNotAllowed(res);
};
