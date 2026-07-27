import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';

const exportRouter = Router();

/**
 * Escape a CSV field value by wrapping in double quotes and doubling internal
 * double-quote characters. Handles null/undefined by returning an empty field.
 */
function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  // Wrap in quotes; any embedded " is doubled
  return '"' + str.replace(/"/g, '""') + '"';
}

/**
 * Format a Date object as an ISO 8601 date string (YYYY-MM-DD).
 */
function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * Format a Date object as a human-readable local ISO timestamp string.
 */
function formatTimestamp(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString();
}

/**
 * GET /api/export/calls
 *
 * Export call records as a UTF-8 CSV file with BOM prefix for Persian
 * text compatibility.
 *
 * Query params:
 *   - dateFrom  (optional) ISO 8601 date string — inclusive lower bound on createdAt
 *   - dateTo    (optional) ISO 8601 date string — inclusive upper bound on createdAt
 *
 * Role behaviour:
 *   - agent: only their own calls
 *   - admin: all calls (with optional date filters)
 *
 * Caps at 50,000 records per export.
 * Returns header-only CSV when no records match.
 *
 * Requires authentication (req.user populated by auth middleware).
 */
exportRouter.get('/api/export/calls', async (req: Request, res: Response): Promise<void> => {
  // --- 1. Authentication check ---
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { userId, role } = req.user;

  // --- 2. Parse optional date range query params ---
  const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };

  // Build the Prisma `where` clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  // Role-based filtering
  if (role !== 'admin') {
    where.agentId = userId;
  }

  // Date range filtering on createdAt
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!isNaN(from.getTime())) {
        where.createdAt.gte = from;
      }
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!isNaN(to.getTime())) {
        // Make dateTo inclusive by extending to end of that day
        to.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }
  }

  // --- 3. Query the database (cap at 50,000 records) ---
  const MAX_RECORDS = 50_000;
  const calls = await prisma.call.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: MAX_RECORDS,
    select: {
      requestId: true,
      date: true,
      phone: true,
      customerName: true,
      categoryName: true,
      subCategoryName: true,
      subSubCategoryName: true,
      status: true,
      description: true,
      agentName: true,
      createdAt: true,
    },
  });

  // --- 4. Build CSV string ---
  // UTF-8 BOM prefix for Persian text compatibility in Excel
  const BOM = '\uFEFF';

  const headers = [
    'requestId',
    'date',
    'phone',
    'customerName',
    'category',
    'subCategory',
    'subSubCategory',
    'status',
    'description',
    'agentName',
    'createdAt',
  ];

  const headerRow = headers.map(escapeCSV).join(',');

  const dataRows = calls.map((call) => {
    return [
      escapeCSV(call.requestId),
      escapeCSV(formatDate(call.date)),
      escapeCSV(call.phone),
      escapeCSV(call.customerName),
      escapeCSV(call.categoryName),
      escapeCSV(call.subCategoryName),
      escapeCSV(call.subSubCategoryName),
      escapeCSV(call.status),
      escapeCSV(call.description),
      escapeCSV(call.agentName),
      escapeCSV(formatTimestamp(call.createdAt)),
    ].join(',');
  });

  const csv = BOM + [headerRow, ...dataRows].join('\r\n');

  // --- 5. Send response ---
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="calls-export.csv"');
  res.status(200).send(csv);
});

export default exportRouter;
