import { getAdminReport } from '../services/adminReportService.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (!DATE.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addUtcDay(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

export async function getAdminReports(request, response, next) {
  try {
    const { period = 'all', startDate, endDate } = request.query;
    let from = null;
    let until = null;
    if (!['all', '30', '90', 'custom'].includes(period)) {
      return response.status(400).json({ success: false, message: 'Choose all time, last 30 days, last 90 days, or a custom date range' });
    }
    if (period === 'custom') {
      if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
        return response.status(400).json({ success: false, message: 'Enter a valid custom start and end date' });
      }
      from = `${startDate}T00:00:00.000Z`;
      until = addUtcDay(endDate);
    } else if (period !== 'all') {
      const now = new Date();
      from = new Date(now.getTime() - Number(period) * 24 * 60 * 60 * 1000).toISOString();
      until = now.toISOString();
    }
    const data = await getAdminReport({ from, until, period });
    response.status(200).json({ success: true, message: 'Admin reports retrieved', data });
  } catch (error) { next(error); }
}
