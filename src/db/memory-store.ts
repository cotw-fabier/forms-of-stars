import { randomUUID } from 'node:crypto';
import type { Submission, SubmissionStore } from '../types/index.js';

/**
 * Volatile, process-local submission store. Useful for development and tests.
 * For production you'll want a real driver — see the README for the contract.
 */
export class MemorySubmissionStore implements SubmissionStore {
  private rows = new Map<string, Submission>();

  async insert(input: Omit<Submission, 'id' | 'createdAt' | 'updatedAt'>): Promise<Submission> {
    const now = new Date();
    const submission: Submission = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(submission.id, submission);
    return submission;
  }

  async update(id: string, patch: Partial<Submission>): Promise<Submission> {
    const existing = this.rows.get(id);
    if (!existing) throw new Error(`Submission ${id} not found`);
    const updated: Submission = { ...existing, ...patch, id: existing.id, updatedAt: new Date() };
    this.rows.set(id, updated);
    return updated;
  }

  async get(id: string): Promise<Submission | null> {
    return this.rows.get(id) ?? null;
  }

  async listByForm(formId: string, opts: { limit?: number; offset?: number } = {}): Promise<Submission[]> {
    const all = Array.from(this.rows.values())
      .filter((s) => s.formId === formId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 100;
    return all.slice(offset, offset + limit);
  }
}
