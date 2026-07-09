function parseAmount(text) {
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

function parseMonths(text) {
  const years = text.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/);
  if (years) return String(Math.max(1, Math.round(Number(years[1]) * 12)));
  if (/\b(a|one)\s+year\b/.test(text)) return '12';
  const months = text.match(/(\d+)\s*(?:months?|mos?)/);
  if (months) return months[1];
  return '12';
}

function parseGoalName(text) {
  const forMatch = text.match(/\bfor\s+(?:a|an|the)?\s*([a-z0-9][a-z0-9\s-]{1,60})/i);
  if (forMatch) return forMatch[1].replace(/\b(goal|target)$/i, '').trim() || 'savings goal';
  const named = text.match(/\b(?:called|named)\s+([a-z0-9][a-z0-9\s-]{1,60})/i);
  if (named) return named[1].trim();
  return 'savings goal';
}

export function parseIntent(text) {
  const t = (text || '').trim();
  const l = t.toLowerCase();

  if (/\b(what if|project|projection|forecast|future|monthly|per month|a month|each month)\b/.test(l)) {
    return {
      action: 'project',
      monthly: parseAmount(l),
      months: parseMonths(l),
      explanation: 'Project how monthly savings grow with yield.',
    };
  }

  if (/\b(goals?|target)\b/.test(l) && /\b(set|create|make|add|save)\b/.test(l)) {
    return {
      action: 'set_goal',
      name: parseGoalName(l),
      target: parseAmount(l),
      explanation: 'Create a savings goal.',
    };
  }

  if (/^\s*save\s+\d+(?:\.\d+)?\s+for\s+/.test(l)) {
    return {
      action: 'set_goal',
      name: parseGoalName(l),
      target: parseAmount(l),
      explanation: 'Create a savings goal.',
    };
  }

  if (/\b(withdraw|take out|cash out|pull out|redeem|take back|get.*back)\b/.test(l)) {
    const all = /\b(all|everything|it all|the lot|max)\b/.test(l);
    return { action: 'withdraw', amount: all ? 'all' : parseAmount(l) || 'all', explanation: 'Take money out of savings.' };
  }

  if (/\b(round\s?up|spare change|skim)\b/.test(l)) {
    return { action: 'roundup', spend: parseAmount(l), explanation: 'Round a purchase up to the next dollar and save the change.' };
  }

  if (/\b(save|deposit|put away|put aside|set aside|invest|stash|top up|add)\b/.test(l)) {
    return { action: 'save', amount: parseAmount(l), explanation: 'Put money into savings.' };
  }

  if (/\b(rate|apy|yield|interest|return|where.*(yield|money).*from|how much.*earn)\b/.test(l)) {
    return { action: 'rate', explanation: 'Show the savings rate and where the yield comes from.' };
  }

  if (/\b(goals?|progress)\b/.test(l)) {
    return { action: 'goals', explanation: 'Show your savings goals and progress.' };
  }

  if (/\b(balance|how much|my money|my savings|position|how am i doing|earned|total|worth)\b/.test(l)) {
    return { action: 'balance', explanation: 'Show your savings and what you have earned so far.' };
  }

  if (/\b(brief|morning|today|daily|update|summary)\b/.test(l)) {
    return { action: 'brief', explanation: 'Your daily savings brief.' };
  }

  return {
    action: 'help',
    explanation: 'Try: "save 20", "how is my money doing", "what is the rate", or "withdraw 5".',
  };
}
