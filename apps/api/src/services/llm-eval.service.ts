import { FieldPath } from 'firebase-admin/firestore';
import type {
  EvalGrade,
  EvalVariantKey,
  LlmEvalDetail,
  LlmEvalItem,
  LlmEvalModelStats,
  LlmEvalSummary,
  MappingTarget,
} from '@pantry-finder/shared';
import { COLLECTIONS, type LlmEvalDocument, type LlmEvalItemDocument } from '@pantry-finder/shared/firestore';
import { db } from '../config/firebase';
import { ReviewError } from './review.service';

const LIST_LIMIT = 20;
const VARIANTS: EvalVariantKey[] = ['A', 'B'];

/** LLM tier comparisons written by tools/crawler `compare-tiers`, graded here. */
export class LlmEvalService {
  private readonly evalsCol = db.collection(COLLECTIONS.llmEvals);

  public async list(): Promise<LlmEvalSummary[]> {
    const snapshot = await this.evalsCol.orderBy('createdAt', 'desc').limit(LIST_LIMIT).get();
    return Promise.all(
      snapshot.docs.map(async (d) => summarize(d.id, d.data() as LlmEvalDocument, await this.items(d.id))),
    );
  }

  public async get(id: string): Promise<LlmEvalDetail> {
    const snap = await this.evalsCol.doc(id).get();
    if (!snap.exists) throw new ReviewError('not_found');
    const items = await this.items(id);
    return { summary: summarize(id, snap.data() as LlmEvalDocument, items), items };
  }

  public async grade(
    evalId: string,
    itemId: string,
    variant: EvalVariantKey,
    target: MappingTarget,
    grade: EvalGrade,
  ): Promise<void> {
    const ref = this.evalsCol.doc(evalId).collection('items').doc(itemId);
    const snap = await ref.get();
    if (!snap.exists) throw new ReviewError('not_found');
    // FieldPath, because targets like `services.0.schedules` contain dots.
    await ref.update(new FieldPath('grades', variant, target), grade);
  }

  private async items(evalId: string): Promise<LlmEvalItem[]> {
    const snapshot = await this.evalsCol.doc(evalId).collection('items').get();
    return snapshot.docs.map((d) => {
      const item = d.data() as LlmEvalItemDocument;
      return { id: d.id, ...item, grades: { A: item.grades?.A ?? {}, B: item.grades?.B ?? {} } };
    });
  }
}

function summarize(id: string, doc: LlmEvalDocument, items: LlmEvalItem[]): LlmEvalSummary {
  const stats = new Map<string, LlmEvalModelStats>(
    doc.models.map((model) => [
      model,
      { model, inputTokens: 0, outputTokens: 0, grades: { correct: 0, partial: 0, wrong: 0 } },
    ]),
  );
  for (const item of items) {
    for (const key of VARIANTS) {
      const variant = item.variants[key];
      const s = stats.get(variant.model);
      if (!s) continue;
      s.inputTokens += variant.inputTokens;
      s.outputTokens += variant.outputTokens;
      for (const grade of Object.values(item.grades[key])) if (grade) s.grades[grade]++;
    }
  }
  return {
    id,
    env: doc.env,
    createdAt: doc.createdAt.toDate().toISOString(),
    itemCount: doc.itemCount,
    models: [...stats.values()],
  };
}
