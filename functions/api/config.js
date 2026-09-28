import { json } from "./_shared.js";

export function onRequestGet({ env }) {
  return json({
    retentionPeriod: env.RETENTION_PERIOD || "카카오톡방 개설 이후 폐기",
    operatorEmail: env.OPERATOR_EMAIL || "운영팀 이메일",
  });
}