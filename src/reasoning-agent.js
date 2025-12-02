// ==================== AutoFeel Reasoning Agent ====================
// Makes intelligent decisions based on perception data

class ReasoningAgent {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize the reasoning agent
   */
  async init() {
    this.initialized = true;
  }

  /**
   * Identify user intent based on perception data
   * @param {object} perception - Perception data from PerceptionAgent
   * @param {object} context - Additional context (hasExisting, contentChanged, etc.)
   * @returns {object} - { intent, confidence, reasoning }
   */
  identifyIntent(perception, context = {}) {
    const { currentPage, userBehavior, temporal } = perception;
    const { hasExisting, contentChanged, similarity } = context;

    // Intent identification rules
    const intents = [];

    // Rule 1: First-time document save
    if (currentPage.pageType === 'document' && !hasExisting) {
      intents.push({
        intent: 'create_knowledge',
        confidence: 0.95,
        reasoning: 'First-time save of document page'
      });
    }

    // Rule 2: Updating existing document
    if (currentPage.pageType === 'document' && hasExisting && contentChanged) {
      if (userBehavior.visitCount > 3 && userBehavior.frequency > 1) {
        intents.push({
          intent: 'iterative_update',
          confidence: 0.90,
          reasoning: 'Frequent visits to document suggest iterative editing'
        });
      } else {
        intents.push({
          intent: 'update_knowledge',
          confidence: 0.85,
          reasoning: 'Updating existing document with changes'
        });
      }
    }

    // Rule 3: Repeated visit without changes
    if (hasExisting && !contentChanged && userBehavior.isRepeatedVisit) {
      intents.push({
        intent: 'review_only',
        confidence: 0.90,
        reasoning: 'Repeated visit to unchanged content'
      });
    }

    // Rule 4: Profile/resume collection
    if (currentPage.pageType === 'profile') {
      if (!hasExisting) {
        intents.push({
          intent: 'collect_profile',
          confidence: 0.85,
          reasoning: 'Collecting new profile/resume information'
        });
      } else if (contentChanged) {
        intents.push({
          intent: 'update_profile',
          confidence: 0.80,
          reasoning: 'Profile has been updated'
        });
      }
    }

    // Rule 5: Form filling context
    if (currentPage.pageType === 'form' && currentPage.formFieldCount > 3) {
      intents.push({
        intent: 'prepare_form_data',
        confidence: 0.85,
        reasoning: 'Form page detected - likely preparing data for auto-fill'
      });
    }

    // Rule 6: Research/learning
    if (currentPage.pageType === 'content' && !hasExisting) {
      if (currentPage.pageSubtype === 'tutorial') {
        intents.push({
          intent: 'learn_reference',
          confidence: 0.75,
          reasoning: 'Saving tutorial content for future reference'
        });
      } else {
        intents.push({
          intent: 'research',
          confidence: 0.70,
          reasoning: 'Collecting research material'
        });
      }
    }

    // Rule 7: Working hours pattern
    if (temporal.isWorkingHours && currentPage.pageType === 'document') {
      intents.push({
        intent: 'work_related',
        confidence: 0.70,
        reasoning: 'Saving work-related document during working hours'
      });
    }

    // Default fallback
    if (intents.length === 0) {
      intents.push({
        intent: 'general_save',
        confidence: 0.50,
        reasoning: 'General content save without specific pattern'
      });
    }

    // Return highest confidence intent
    intents.sort((a, b) => b.confidence - a.confidence);
    return intents[0];
  }

  /**
   * Decide strategy based on intent and context
   * @param {object} intent - Identified intent
   * @param {object} perception - Perception data
   * @param {object} context - Additional context
   * @returns {object} - { strategy, action, params, reasoning }
   */
  decideStrategy(intent, perception, context = {}) {
    const { currentPage, userBehavior } = perception;
    const { hasExisting, similarity } = context;

    // Strategy decision matrix
    const strategies = {
      // Documentation strategies
      'create_knowledge': {
        strategy: 'create_new',
        action: 'save_document',
        params: {
          trackVersion: true,
          enableSemanticSearch: true,
          priority: 'high'
        },
        reasoning: 'Creating new knowledge document with version tracking'
      },

      'update_knowledge': {
        strategy: 'version_update',
        action: 'update_document',
        params: {
          createVersion: true,
          preserveHistory: true,
          notifyChange: true
        },
        reasoning: 'Updating existing document with new version'
      },

      'iterative_update': {
        strategy: 'smart_merge',
        action: 'update_document',
        params: {
          createVersion: true,
          preserveHistory: true,
          highlightChanges: true,
          notifyChange: true
        },
        reasoning: 'Frequent updates detected - using smart merge strategy'
      },

      'review_only': {
        strategy: 'skip',
        action: 'skip_save',
        params: {
          updateLastAccess: true,
          incrementViewCount: true
        },
        reasoning: `No changes detected (${(similarity * 100).toFixed(0)}% similar) - skipping save`
      },

      // Profile strategies
      'collect_profile': {
        strategy: 'create_profile',
        action: 'save_document',
        params: {
          category: 'profile',
          extractStructuredData: true,
          enableFormSync: true
        },
        reasoning: 'Creating new profile entry for form auto-fill'
      },

      'update_profile': {
        strategy: 'merge_profile',
        action: 'update_document',
        params: {
          intelligentMerge: true,
          preserveExisting: true,
          updateFormData: true
        },
        reasoning: 'Merging updated profile information'
      },

      // Form strategies
      'prepare_form_data': {
        strategy: 'save_for_autofill',
        action: 'save_document',
        params: {
          extractFormFields: true,
          mapToSchema: true,
          enableQuickFill: true
        },
        reasoning: 'Saving content optimized for form auto-fill'
      },

      // Learning strategies
      'learn_reference': {
        strategy: 'create_reference',
        action: 'save_document',
        params: {
          category: 'learning',
          extractCodeSnippets: true,
          enableSemanticSearch: true
        },
        reasoning: 'Saving technical reference material'
      },

      'research': {
        strategy: 'create_research',
        action: 'save_document',
        params: {
          category: 'research',
          enableSemanticSearch: true
        },
        reasoning: 'Saving research material'
      },

      // Work-related
      'work_related': {
        strategy: 'create_work_doc',
        action: 'save_document',
        params: {
          category: 'work',
          trackVersion: true,
          priority: 'high'
        },
        reasoning: 'Saving work-related documentation'
      },

      // Default
      'general_save': {
        strategy: 'create_general',
        action: 'save_document',
        params: {
          enableSemanticSearch: true
        },
        reasoning: 'General content save'
      }
    };

    // Get strategy for identified intent
    const decision = strategies[intent.intent] || strategies['general_save'];

    // Enhance strategy with page-type specific params
    if (currentPage.pageType === 'document') {
      decision.params.documentType = currentPage.pageSubtype;
      decision.params.trackChanges = true;
    }

    if (userBehavior.isRepeatedVisit) {
      decision.params.visitCount = userBehavior.visitCount;
      decision.params.isRepeatedVisit = true;
    }

    return {
      ...decision,
      intentConfidence: intent.confidence,
      intentReasoning: intent.reasoning
    };
  }

  /**
   * LLM-driven intent identification (Phase 3)
   * @param {object} perception - Perception data
   * @param {object} context - Additional context
   * @param {object} config - LLM configuration
   * @returns {object} - Enhanced intent with LLM analysis
   */
  async identifyIntentWithLLM(perception, context, config) {
    const { currentPage, userBehavior, temporal } = perception;

    // Build prompt for LLM
    const prompt = `You are an intelligent assistant analyzing user behavior to identify their intent.

Page Information:
- Title: ${currentPage.title}
- URL: ${currentPage.url}
- Page Type: ${currentPage.pageType}/${currentPage.pageSubtype} (${(currentPage.confidence * 100).toFixed(0)}% confidence)
- Word Count: ${currentPage.wordCount}

User Behavior:
- Visit Count: ${userBehavior.visitCount}
- Is Repeated Visit: ${userBehavior.isRepeatedVisit}
- Visit Frequency: ${userBehavior.frequency.toFixed(2)} visits/day

Document Status:
- Has Existing Document: ${context.hasExisting ? 'Yes' : 'No'}
- Content Changed: ${context.contentChanged ? 'Yes' : 'No'}
- Similarity: ${(context.similarity * 100).toFixed(1)}%

Temporal Context:
- Time of Day: ${temporal.timeOfDay}
- Working Hours: ${temporal.isWorkingHours ? 'Yes' : 'No'}

Based on this information, identify the user's intent. Choose from:
- create_knowledge: First-time save of valuable document
- update_knowledge: Updating existing document with changes
- iterative_update: Frequent updates suggesting active editing/development
- review_only: Just reviewing, no changes to save
- collect_profile: Collecting profile/resume information
- update_profile: Updating existing profile
- prepare_form_data: Saving content for form auto-fill
- learn_reference: Saving tutorial/technical reference
- research: General research material
- work_related: Work-related document during work hours
- general_save: General content save

Respond in JSON format:
{
  "intent": "intent_name",
  "confidence": 0.XX,
  "reasoning": "Brief explanation"
}`;

    try {
      // Call LLM (using existing infrastructure)
      const requestBody = this.buildLLMRequestBody(
        config.llmProvider,
        config.modelName,
        prompt,
        null,
        { maxTokens: 300, temperature: 0.3 }
      );

      const response = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`LLM request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const content = this.extractLLMContent(data, config.llmProvider);

      // Parse LLM response
      const llmIntent = JSON.parse(content);

      console.log('[AutoFeel Reasoning] LLM Intent:', llmIntent);

      return llmIntent;
    } catch (error) {
      console.warn('[AutoFeel Reasoning] LLM intent identification failed, falling back to rules:', error);
      // Fallback to rule-based intent identification
      return this.identifyIntent(perception, context);
    }
  }

  /**
   * Generate semantic diff using LLM (Phase 3)
   * @param {object} oldDoc - Existing document
   * @param {object} newDoc - New document
   * @param {object} config - LLM configuration
   * @returns {object} - Semantic diff analysis
   */
  async generateSemanticDiff(oldDoc, newDoc, config) {
    const prompt = `You are analyzing changes between two versions of a document.

OLD VERSION (v${oldDoc.metadata.version || 1}):
Title: ${oldDoc.title}
Captured: ${oldDoc.captured_at}
Content Preview: ${oldDoc.clean_text.substring(0, 1000)}...

NEW VERSION:
Title: ${newDoc.title}
Content Preview: ${newDoc.clean_text.substring(0, 1000)}...

Analyze the semantic differences and provide:
1. Type of change (minor_edit, significant_update, major_revision, complete_rewrite)
2. Key changes (list of important changes)
3. Impact level (low, medium, high)
4. Recommendation (update_version, create_new, skip_duplicate)

Respond in JSON format:
{
  "changeType": "type",
  "keyChanges": ["change1", "change2"],
  "impactLevel": "level",
  "recommendation": "action",
  "summary": "Brief summary of changes"
}`;

    try {
      const requestBody = this.buildLLMRequestBody(
        config.llmProvider,
        config.modelName,
        prompt,
        null,
        { maxTokens: 500, temperature: 0.3 }
      );

      const response = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`LLM request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const content = this.extractLLMContent(data, config.llmProvider);

      const diff = JSON.parse(content);

      console.log('[AutoFeel Reasoning] Semantic Diff:', diff);

      return diff;
    } catch (error) {
      console.warn('[AutoFeel Reasoning] Semantic diff failed:', error);
      return null;
    }
  }

  /**
   * Build LLM request body (helper)
   */
  buildLLMRequestBody(provider, modelName, userPrompt, systemPrompt = null, options = {}) {
    const { maxTokens = 1500, temperature = 0.7 } = options;

    if (provider === 'openai' || provider === 'custom') {
      const messages = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: userPrompt });
      return { model: modelName, messages, max_tokens: maxTokens, temperature };
    } else if (provider === 'anthropic') {
      const body = {
        model: modelName,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: userPrompt }]
      };
      if (systemPrompt) body.system = systemPrompt;
      return body;
    }
    return { model: modelName, messages: [{ role: 'user', content: userPrompt }], max_tokens: maxTokens };
  }

  /**
   * Extract content from LLM response (helper)
   */
  extractLLMContent(data, provider) {
    if (provider === 'anthropic') {
      return data.content[0].text;
    } else if (provider === 'openai' || provider === 'custom') {
      return data.choices[0].message.content;
    }
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Main reasoning method - analyze situation and decide action
   * @param {object} perception - Perception data from PerceptionAgent
   * @param {object} context - Additional context
   * @param {object} config - Optional LLM config for enhanced reasoning
   * @returns {object} - Complete decision with intent and strategy
   */
  async reason(perception, context = {}, config = null) {
    await this.init();

    // Step 1: Identify intent (use LLM if config provided)
    let intent;
    if (config && config.useLLMReasoning) {
      intent = await this.identifyIntentWithLLM(perception, context, config);
    } else {
      intent = this.identifyIntent(perception, context);
    }
    console.log('[AutoFeel Reasoning] Identified intent:', intent);

    // Step 2: Decide strategy
    const decision = this.decideStrategy(intent, perception, context);
    console.log('[AutoFeel Reasoning] Decision:', decision);

    // Step 3: Return complete decision
    return {
      intent: intent,
      decision: decision,
      perception: perception,
      metadata: {
        decidedAt: new Date().toISOString(),
        reasoningVersion: config?.useLLMReasoning ? '3.0-llm' : '2.0-rules',
        usedLLM: !!config?.useLLMReasoning
      }
    };
  }

  /**
   * Validate if action should proceed
   * @param {object} decision - Decision from reason()
   * @returns {boolean}
   */
  shouldProceed(decision) {
    // Always skip if strategy is 'skip'
    if (decision.decision.strategy === 'skip') {
      return false;
    }

    // Proceed for all other strategies
    return true;
  }

  /**
   * Get human-readable explanation of decision
   * @param {object} decision - Decision from reason()
   * @returns {string}
   */
  explainDecision(decision) {
    const { intent, decision: strategy } = decision;

    return `
Intent: ${intent.intent} (${(intent.confidence * 100).toFixed(0)}% confidence)
Reasoning: ${intent.reasoning}

Strategy: ${strategy.strategy}
Action: ${strategy.action}
Reason: ${strategy.reasoning}
    `.trim();
  }
}

// Create singleton instance
const reasoningAgent = new ReasoningAgent();

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = reasoningAgent;
}
