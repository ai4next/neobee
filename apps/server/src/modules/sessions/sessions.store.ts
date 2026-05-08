import type {
  CreateSessionInput,
  GraphData,
  IdeaCandidate,
  ResearchBrief,
  ReviewScore,
  SessionAggregate,
  SessionCheckpoint,
  SessionEvent,
  SessionRecord,
  SessionRound,
  SessionStage,
  SessionStatus,
  SummaryDocument,
  ExpertProfile
} from '@neobee/shared';
import { getDb } from '../../lib/db.js';

export class SessionStore {
  private readonly sessions = new Map<string, SessionAggregate>();
  private readonly events = new Map<string, SessionEvent[]>();

  constructor() {
    this.loadFromDb();
  }

  private loadFromDb(): void {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM session').all() as any[];
    for (const row of rows) {
      const aggregate = this.rowToAggregate(row, db);
      this.sessions.set(aggregate.session.id, aggregate);
      const eventRows = db.prepare('SELECT * FROM session_event WHERE session_id = ? ORDER BY timestamp').all(row.id) as any[];
      this.events.set(
        aggregate.session.id,
        eventRows.map((er) => ({
          id: er.id,
          sessionId: er.session_id,
          type: er.type,
          stage: er.stage,
          timestamp: er.timestamp,
          payload: JSON.parse(er.payload)
        }))
      );
    }
  }

  private rowToAggregate(row: any, db: any): SessionAggregate {
    const briefRow = db.prepare('SELECT * FROM deep_research_data WHERE session_id = ?').get(row.id);
    const expertRows = db.prepare('SELECT id, session_id, name, domain, persona_style, stance, skills FROM expert_creation_data WHERE session_id = ?').all(row.id);
    const insightRows = db.prepare('SELECT id, session_id, round_number, expert_id, insight, rationale, refs, links FROM insight_refinement_data WHERE session_id = ? ORDER BY round_number').all(row.id);
    const reviewRows = db.prepare('SELECT * FROM cross_review_data WHERE session_id = ?').all(row.id);
    const ideaRows = db.prepare('SELECT * FROM idea_synthesis_data WHERE session_id = ?').all(row.id);
    const graphRow = db.prepare('SELECT * FROM graph_build_data WHERE session_id = ?').get(row.id);
    const summaryRow = db.prepare('SELECT * FROM summary_data WHERE session_id = ?').get(row.id);
    const errorRow = db.prepare('SELECT * FROM session_error WHERE session_id = ?').get(row.id);
    const checkpointRow = db.prepare('SELECT * FROM session_checkpoint WHERE session_id = ?').get(row.id);

    // Group insights by expertId and round
    const roundsMap = new Map<string, any[]>();
    for (const row of insightRows) {
      const key = `${row.expert_id}-${row.round_number}`;
      if (!roundsMap.has(key)) {
        roundsMap.set(key, []);
      }
      roundsMap.get(key)!.push({
        id: row.id,
        round: row.round_number,
        expertId: row.expert_id,
        insight: row.insight,
        rationale: row.rationale,
        references: JSON.parse(row.refs),
        links: JSON.parse(row.links)
      });
    }
    const rounds: SessionRound[] = Array.from(roundsMap.entries()).map(([key, insights]) => {
      const [expertId, roundStr] = key.split('-');
      return {
        round: parseInt(roundStr, 10),
        expertId,
        insights
      };
    }).sort((a, b) => a.round - b.round);

    const session: SessionRecord = {
      id: row.id,
      topic: row.topic,
      roundCount: row.round_count,
      expertCount: row.expert_count,
      additionalInfo: row.additional_info,
      language: row.language,
      status: row.status as SessionStatus,
      currentStage: row.current_stage as SessionStage,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    let checkpoint: SessionCheckpoint | null = null;
    if (checkpointRow) {
      checkpoint = {
        completedStages: JSON.parse(checkpointRow.completed_stages),
        currentStage: checkpointRow.current_stage as SessionStage,
        stageProgress: checkpointRow.stage_progress,
        researchBrief: checkpointRow.research_brief ? JSON.parse(checkpointRow.research_brief) : null,
        experts: checkpointRow.experts ? JSON.parse(checkpointRow.experts) : [],
        rounds: checkpointRow.rounds ? JSON.parse(checkpointRow.rounds) : [],
        reviews: checkpointRow.reviews ? JSON.parse(checkpointRow.reviews) : [],
        ideas: checkpointRow.ideas ? JSON.parse(checkpointRow.ideas) : [],
        graph: checkpointRow.graph ? JSON.parse(checkpointRow.graph) : { nodes: [], edges: [] },
        insightRefinementCursor: checkpointRow.insight_cursor ? JSON.parse(checkpointRow.insight_cursor) : null
      };
    }

    const aggregate: SessionAggregate = {
      session,
      checkpoint,
      researchBrief: briefRow
        ? {
            topicFrame: briefRow.topic_frame,
            keyFacts: JSON.parse(briefRow.key_facts),
            openQuestions: JSON.parse(briefRow.open_questions),
            signals: JSON.parse(briefRow.signals),
            sourceRefs: JSON.parse(briefRow.source_refs)
          }
        : null,
      researchProgress: [],
      experts: expertRows.map((er: any) => ({
        id: er.id,
        name: er.name,
        domain: er.domain,
        personaStyle: er.persona_style,
        stance: er.stance,
        skills: JSON.parse(er.skills)
      })),
      rounds,
      reviews: reviewRows.map((rr: any) => ({
        insightId: rr.insight_id,
        reviewerExpertId: rr.reviewer_expert_id,
        novelty: rr.novelty,
        usefulness: rr.usefulness,
        feasibility: rr.feasibility,
        evidenceStrength: rr.evidence_strength,
        crossDomainLeverage: rr.cross_domain_leverage,
        riskAwareness: rr.risk_awareness,
        comment: rr.comment,
        objectionLevel: rr.objection_level
      })),
      ideas: ideaRows.map((ir: any) => ({
        id: ir.id,
        title: ir.title,
        thesis: ir.thesis,
        supportingInsights: JSON.parse(ir.supporting_insights),
        whyNow: ir.why_now,
        targetUser: ir.target_user,
        coreMechanism: ir.core_mechanism,
        risks: JSON.parse(ir.risks),
        totalScore: ir.total_score,
        controversyLabel: ir.controversy_label as any
      })),
      graph: graphRow ? { nodes: JSON.parse(graphRow.nodes), edges: JSON.parse(graphRow.edges) } : { nodes: [], edges: [] },
      summary: summaryRow
        ? {
            bestIdeas: JSON.parse(summaryRow.best_ideas),
            controversialIdeas: JSON.parse(summaryRow.controversial_ideas),
            unresolvedQuestions: JSON.parse(summaryRow.unresolved_questions),
            executiveSummary: summaryRow.executive_summary
          }
        : null,
      errors: errorRow ? JSON.parse(errorRow.errors) : []
    };

    return aggregate;
  }

  create(input: CreateSessionInput): SessionAggregate {
    const now = new Date().toISOString();
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      topic: input.topic,
      roundCount: input.roundCount,
      expertCount: input.expertCount,
      additionalInfo: input.additionalInfo ?? '',
      language: input.language ?? 'en',
      status: 'created',
      currentStage: 'topic_intake',
      createdAt: now,
      updatedAt: now
    };

    const aggregate: SessionAggregate = {
      session,
      checkpoint: null,
      researchBrief: null,
      researchProgress: [],
      experts: [],
      rounds: [],
      reviews: [],
      ideas: [],
      graph: { nodes: [], edges: [] },
      summary: null,
      errors: []
    };

    const db = getDb();
    db.prepare(
      `INSERT INTO session (id, topic, round_count, expert_count, additional_info, language, status, current_stage, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      session.id,
      session.topic,
      session.roundCount,
      session.expertCount,
      session.additionalInfo,
      session.language,
      session.status,
      session.currentStage,
      session.createdAt,
      session.updatedAt
    );

    this.sessions.set(session.id, aggregate);
    this.events.set(session.id, []);
    return aggregate;
  }

  list(): SessionAggregate[] {
    return [...this.sessions.values()];
  }

  get(sessionId: string): SessionAggregate | undefined {
    return this.sessions.get(sessionId);
  }

  findByCurrentStage(stage: SessionStage): SessionRecord[] {
    return [...this.sessions.values()]
      .filter((agg) => agg.session.currentStage === stage)
      .map((agg) => agg.session);
  }

  setStatus(sessionId: string, status: SessionStatus, stage: SessionStage | null): SessionAggregate {
    const aggregate = this.require(sessionId);
    aggregate.session.status = status;
    aggregate.session.currentStage = stage;
    aggregate.session.updatedAt = new Date().toISOString();
    this.persistSession(aggregate);
    return aggregate;
  }

  saveCheckpoint(sessionId: string, checkpoint: SessionCheckpoint): void {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO session_checkpoint
        (session_id, completed_stages, current_stage, stage_progress, research_brief, experts, rounds, reviews, ideas, graph, insight_cursor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      JSON.stringify(checkpoint.completedStages),
      checkpoint.currentStage,
      checkpoint.stageProgress,
      checkpoint.researchBrief ? JSON.stringify(checkpoint.researchBrief) : null,
      checkpoint.experts.length > 0 ? JSON.stringify(checkpoint.experts) : null,
      checkpoint.rounds.length > 0 ? JSON.stringify(checkpoint.rounds) : null,
      checkpoint.reviews.length > 0 ? JSON.stringify(checkpoint.reviews) : null,
      checkpoint.ideas.length > 0 ? JSON.stringify(checkpoint.ideas) : null,
      JSON.stringify(checkpoint.graph),
      checkpoint.insightRefinementCursor ? JSON.stringify(checkpoint.insightRefinementCursor) : null
    );

    const aggregate = this.require(sessionId);
    aggregate.checkpoint = checkpoint;
    this.persistSession(aggregate);
  }

  getCheckpoint(sessionId: string): SessionCheckpoint | null {
    return this.get(sessionId)?.checkpoint ?? null;
  }

  clearCheckpoint(sessionId: string): void {
    const db = getDb();
    db.prepare('DELETE FROM session_checkpoint WHERE session_id = ?').run(sessionId);
    const aggregate = this.sessions.get(sessionId);
    if (aggregate) {
      aggregate.checkpoint = null;
    }
  }

  setResearchBrief(sessionId: string, researchBrief: ResearchBrief): SessionAggregate {
    const aggregate = this.require(sessionId);
    aggregate.researchBrief = researchBrief;
    aggregate.session.updatedAt = new Date().toISOString();
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO deep_research_data (session_id, topic_frame, key_facts, open_questions, signals, source_refs)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      sessionId,
      researchBrief.topicFrame,
      JSON.stringify(researchBrief.keyFacts),
      JSON.stringify(researchBrief.openQuestions),
      JSON.stringify(researchBrief.signals),
      JSON.stringify(researchBrief.sourceRefs)
    );
    this.persistSession(aggregate);
    return aggregate;
  }

  setExperts(sessionId: string, experts: ExpertProfile[]): SessionAggregate {
    const aggregate = this.require(sessionId);
    aggregate.experts = experts;
    aggregate.session.updatedAt = new Date().toISOString();
    const db = getDb();
    db.prepare('DELETE FROM expert_creation_data WHERE session_id = ?').run(sessionId);
    const insert = db.prepare(
      `INSERT INTO expert_creation_data (id, session_id, name, domain, persona_style, stance, skills)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const e of experts) {
      insert.run(
        e.id, sessionId, e.name, e.domain, e.personaStyle, e.stance,
        JSON.stringify(e.skills)
      );
    }
    this.persistSession(aggregate);
    return aggregate;
  }

  setRounds(sessionId: string, rounds: SessionRound[]): SessionAggregate {
    const aggregate = this.require(sessionId);
    aggregate.rounds = rounds;
    aggregate.session.updatedAt = new Date().toISOString();
    const db = getDb();
    db.prepare('DELETE FROM insight_refinement_data WHERE session_id = ?').run(sessionId);
    const insert = db.prepare(
      `INSERT INTO insight_refinement_data (session_id, round_number, expert_id, insight, rationale, refs, links)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const round of rounds) {
      for (const insight of round.insights) {
        insert.run(
          sessionId, round.round, insight.expertId, insight.insight, insight.rationale,
          JSON.stringify(insight.references), JSON.stringify(insight.links)
        );
      }
    }
    this.persistSession(aggregate);
    return aggregate;
  }

  setReviews(sessionId: string, reviews: ReviewScore[]): SessionAggregate {
    const aggregate = this.require(sessionId);
    aggregate.reviews = reviews;
    aggregate.session.updatedAt = new Date().toISOString();
    const db = getDb();
    const insert = db.prepare(
      `INSERT INTO cross_review_data (id, session_id, insight_id, reviewer_expert_id, novelty, usefulness, feasibility, evidence_strength, cross_domain_leverage, risk_awareness, comment, objection_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of reviews) {
      insert.run(
        crypto.randomUUID(), sessionId, r.insightId, r.reviewerExpertId,
        r.novelty, r.usefulness, r.feasibility, r.evidenceStrength,
        r.crossDomainLeverage, r.riskAwareness, r.comment, r.objectionLevel
      );
    }
    this.persistSession(aggregate);
    return aggregate;
  }

  setIdeas(sessionId: string, ideas: IdeaCandidate[]): SessionAggregate {
    const aggregate = this.require(sessionId);
    aggregate.ideas = ideas;
    aggregate.session.updatedAt = new Date().toISOString();
    const db = getDb();
    const insert = db.prepare(
      `INSERT INTO idea_synthesis_data (id, session_id, title, thesis, supporting_insights, why_now, target_user, core_mechanism, risks, total_score, controversy_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const idea of ideas) {
      insert.run(
        idea.id, sessionId, idea.title, idea.thesis, JSON.stringify(idea.supportingInsights),
        idea.whyNow, idea.targetUser, idea.coreMechanism, JSON.stringify(idea.risks),
        idea.totalScore, idea.controversyLabel ?? null
      );
    }
    this.persistSession(aggregate);
    return aggregate;
  }

  setGraph(sessionId: string, graph: GraphData): SessionAggregate {
    const aggregate = this.require(sessionId);
    aggregate.graph = graph;
    aggregate.session.updatedAt = new Date().toISOString();
    const db = getDb();
    db.prepare('INSERT OR REPLACE INTO graph_build_data (session_id, nodes, edges) VALUES (?, ?, ?)').run(
      sessionId, JSON.stringify(graph.nodes), JSON.stringify(graph.edges)
    );
    this.persistSession(aggregate);
    return aggregate;
  }

  setSummary(sessionId: string, summary: SummaryDocument): SessionAggregate {
    const aggregate = this.require(sessionId);
    aggregate.summary = summary;
    aggregate.session.updatedAt = new Date().toISOString();
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO summary_data (session_id, best_ideas, controversial_ideas, unresolved_questions, executive_summary)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      sessionId, JSON.stringify(summary.bestIdeas), JSON.stringify(summary.controversialIdeas),
      JSON.stringify(summary.unresolvedQuestions), summary.executiveSummary
    );
    this.persistSession(aggregate);
    return aggregate;
  }

  appendEvent(sessionId: string, event: SessionEvent): void {
    const events = this.events.get(sessionId);
    if (!events) {
      return;
    }
    events.push(event);
    const db = getDb();
    db.prepare(
      'INSERT INTO session_event (id, session_id, type, stage, timestamp, payload) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(event.id, sessionId, event.type, event.stage, event.timestamp, JSON.stringify(event.payload));
  }

  getEvents(sessionId: string): SessionEvent[] {
    return this.events.get(sessionId) ?? [];
  }

  private persistSession(aggregate: SessionAggregate): void {
    const s = aggregate.session;
    const db = getDb();
    db.prepare(
      `UPDATE session SET topic=?, round_count=?, expert_count=?, additional_info=?, language=?, status=?, current_stage=?, updated_at=? WHERE id=?`
    ).run(
      s.topic, s.roundCount, s.expertCount,
      s.additionalInfo, s.language, s.status, s.currentStage, s.updatedAt, s.id
    );
  }

  private require(sessionId: string): SessionAggregate {
    const aggregate = this.sessions.get(sessionId);
    if (!aggregate) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return aggregate;
  }
}