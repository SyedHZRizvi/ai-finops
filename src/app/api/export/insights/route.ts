import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { computeInsights } from '@/lib/insights';
import { ensurePricingLoaded } from '@/lib/pricing';
import { toCsv, type CsvColumn } from '@/lib/csv';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  period: z.enum(['24h', '7d', '30d', 'all']).default('30d'),
  format: z.enum(['csv', 'json']).default('json'),
});

function todayStamp(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

const TOTALS_COLUMNS: CsvColumn[] = [
  { key: 'metric', label: 'metric' },
  { key: 'value', label: 'value' },
];

const ROOT_CAUSE_COLUMNS: CsvColumn[] = [
  { key: 'kind', label: 'kind' },
  { key: 'title', label: 'title' },
  { key: 'description', label: 'description' },
  { key: 'severity', label: 'severity' },
  { key: 'estimatedAnnualWaste', label: 'estimatedAnnualWaste' },
];

const RECOMMENDATION_COLUMNS: CsvColumn[] = [
  { key: 'id', label: 'id' },
  { key: 'title', label: 'title' },
  { key: 'rationale', label: 'rationale' },
  { key: 'action', label: 'action' },
  { key: 'estimatedMonthlySavings', label: 'estimatedMonthlySavings' },
  { key: 'estimatedAnnualSavings', label: 'estimatedAnnualSavings' },
  { key: 'affectedCalls', label: 'affectedCalls' },
  { key: 'confidence', label: 'confidence' },
  { key: 'category', label: 'category' },
];

const TOP_SPENDER_COLUMNS: CsvColumn[] = [
  { key: 'id', label: 'id' },
  { key: 'timestamp', label: 'timestamp' },
  { key: 'appName', label: 'appName' },
  { key: 'model', label: 'model' },
  { key: 'category', label: 'category' },
  { key: 'complexity', label: 'complexity' },
  { key: 'inputTokens', label: 'inputTokens' },
  { key: 'outputTokens', label: 'outputTokens' },
  { key: 'totalCost', label: 'totalCost' },
  { key: 'promptPreview', label: 'promptPreview' },
];

const MODEL_MISMATCH_COLUMNS: CsvColumn[] = [
  { key: 'model', label: 'model' },
  { key: 'recommendedModel', label: 'recommendedModel' },
  { key: 'complexity', label: 'complexity' },
  { key: 'category', label: 'category' },
  { key: 'calls', label: 'calls' },
  { key: 'totalCost', label: 'totalCost' },
  { key: 'estimatedSavings', label: 'estimatedSavings' },
];

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid query', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { period, format } = parsed.data;

    await ensurePricingLoaded();
    const insights = await computeInsights(period);
    const filename = `insights-${period}-${todayStamp()}.${format}`;

    if (format === 'json') {
      return new NextResponse(JSON.stringify(insights, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // CSV: build a multi-section file. Excel and Google Sheets both
    // tolerate this and will treat each "## SECTION" line as a label row
    // sitting above its own header-and-data block. Users can split into
    // separate sheets manually or with Power Query.
    const totalsRows = [
      { metric: 'period', value: insights.period },
      { metric: 'generatedAt', value: insights.generatedAt },
      { metric: 'totals.calls', value: insights.totals.calls },
      { metric: 'totals.cost', value: insights.totals.cost },
      { metric: 'totals.avgCostPerCall', value: insights.totals.avgCostPerCall },
      { metric: 'projectedSavings.monthly', value: insights.projectedSavings.monthly },
      { metric: 'projectedSavings.annual', value: insights.projectedSavings.annual },
      {
        metric: 'projectedSavings.percentReduction',
        value: insights.projectedSavings.percentReduction,
      },
      { metric: 'concentration.p20Cost', value: insights.concentration.p20Cost },
      { metric: 'concentration.p20Percent', value: insights.concentration.p20Percent },
      { metric: 'concentration.p5Cost', value: insights.concentration.p5Cost },
      { metric: 'concentration.p5Percent', value: insights.concentration.p5Percent },
      { metric: 'concentration.giniLike', value: insights.concentration.giniLike },
    ];

    const sections: string[] = [];

    sections.push('## TOTALS');
    sections.push(toCsv(totalsRows, TOTALS_COLUMNS));

    sections.push('## ROOT CAUSES');
    sections.push(
      toCsv(
        insights.rootCauses.map((rc) => ({
          kind: rc.kind,
          title: rc.title,
          description: rc.description,
          severity: rc.severity,
          estimatedAnnualWaste: rc.estimatedAnnualWaste,
        })),
        ROOT_CAUSE_COLUMNS,
      ),
    );

    sections.push('## RECOMMENDATIONS');
    sections.push(
      toCsv(
        insights.recommendations.map((r) => ({
          id: r.id,
          title: r.title,
          rationale: r.rationale,
          action: r.action,
          estimatedMonthlySavings: r.estimatedMonthlySavings,
          estimatedAnnualSavings: r.estimatedAnnualSavings,
          affectedCalls: r.affectedCalls,
          confidence: r.confidence,
          category: r.category,
        })),
        RECOMMENDATION_COLUMNS,
      ),
    );

    sections.push('## TOP SPENDERS');
    sections.push(
      toCsv(
        insights.topSpenders.map((s) => ({
          id: s.id,
          timestamp: s.timestamp,
          appName: s.appName ?? '',
          model: s.model,
          category: s.category,
          complexity: s.complexity,
          inputTokens: s.inputTokens,
          outputTokens: s.outputTokens,
          totalCost: s.totalCost,
          promptPreview: s.promptPreview,
        })),
        TOP_SPENDER_COLUMNS,
      ),
    );

    sections.push('## MODEL MISMATCH');
    sections.push(
      toCsv(
        insights.modelMismatch.map((m) => ({
          model: m.model,
          recommendedModel: m.recommendedModel,
          complexity: m.complexity,
          category: m.category,
          calls: m.calls,
          totalCost: m.totalCost,
          estimatedSavings: m.estimatedSavings,
        })),
        MODEL_MISMATCH_COLUMNS,
      ),
    );

    // Section separator: blank line between blocks.
    const csv = sections.join('\r\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
