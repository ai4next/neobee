from __future__ import annotations

from neobee.models import SessionStage


def stage_label(stage: SessionStage, language: str = "en") -> str:
    labels_en = {
        SessionStage.TOPIC_INTAKE: "Topic Intake",
        SessionStage.DEEP_RESEARCH: "Deep Research",
        SessionStage.EXPERT_CREATION: "Expert Creation",
        SessionStage.INSIGHT_REFINEMENT: "Insight Refinement",
        SessionStage.CROSS_REVIEW: "Cross Review",
        SessionStage.IDEA_SYNTHESIS: "Idea Synthesis",
    }
    labels_zh = {
        SessionStage.TOPIC_INTAKE: "主题收集",
        SessionStage.DEEP_RESEARCH: "深度研究",
        SessionStage.EXPERT_CREATION: "专家生成",
        SessionStage.INSIGHT_REFINEMENT: "洞察凝练",
        SessionStage.CROSS_REVIEW: "交叉评审",
        SessionStage.IDEA_SYNTHESIS: "想法合成",
    }
    return labels_zh.get(stage, stage.value) if language == "zh" else labels_en.get(stage, stage.value)