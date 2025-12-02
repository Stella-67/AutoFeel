// ==================== AutoFeel Perception Agent ====================
// Observes user behavior and page context to enable intelligent decisions

class PerceptionAgent {
  constructor() {
    this.visitHistory = null;
  }

  /**
   * Initialize the agent by loading visit history
   */
  async init() {
    const { visitHistory } = await chrome.storage.local.get(['visitHistory']);
    this.visitHistory = visitHistory || {};
  }

  /**
   * Classify page type based on content and DOM structure
   * @param {object} context - Page context with url, title, content, dom info
   * @returns {object} - { type, subtype, confidence, indicators }
   */
  classifyPageType(context) {
    const { url = '', title = '', metadata = {} } = context || {};
    const domain = this.extractDomain(url);

    // Ensure metadata has default values
    const {
      wordCount = 0,
      formFieldCount = 0,
      hasCodeBlocks = false,
      hasTextarea = false,
      headingCount = 0
    } = metadata;

    // Define classification rules with confidence scores
    const classifications = [
      // ① Profile (人物/组织档案) 👤
      {
        type: 'profile',
        subtype: 'personal_profile',
        test: () => {
          // LinkedIn profile
          if (domain.includes('linkedin.com') && /in\/|profile/i.test(url)) return true;
          // GitHub profile
          if (domain.includes('github.com') && /^https:\/\/github\.com\/[^\/]+\/?$/i.test(url)) return true;
          // About/Bio/Resume pages with moderate content
          if (/about|resume|cv|bio|portfolio/i.test(url) || /about|resume|cv|bio/i.test(title)) {
            return wordCount >= 50 && wordCount <= 1200;
          }
          return false;
        },
        confidence: 0.90
      },
      {
        type: 'profile',
        subtype: 'org_profile',
        test: () => /team|about-us|company|organization/i.test(url) && wordCount >= 100,
        confidence: 0.75
      },

      // ② Document (文档型) 📑
      // 识别依据：Heading 结构 + 大段正文 + TOC
      {
        type: 'document',
        subtype: 'personal_statement',
        test: () => {
          // Personal statement, SOP for university applications
          return (/statement|essay|sop|application/i.test(title) || /statement|essay/i.test(url)) &&
                 wordCount >= 300 &&
                 headingCount >= 1;
        },
        confidence: 0.85
      },
      {
        type: 'document',
        subtype: 'technical_doc',
        test: () => {
          // Technical documentation with code blocks
          return (/docs\.|documentation|api|reference|guide/i.test(url) || /documentation|guide/i.test(title)) &&
                 hasCodeBlocks &&
                 headingCount >= 2;
        },
        confidence: 0.90
      },
      {
        type: 'document',
        subtype: 'wiki_doc',
        test: () => {
          // Notion, Confluence, Google Docs style documents
          return (/wiki|confluence|notion|docs\.google/i.test(url) ||
                 /wiki|documentation/i.test(title)) &&
                 wordCount >= 300 &&
                 headingCount >= 2;
        },
        confidence: 0.90
      },
      {
        type: 'document',
        subtype: 'research_note',
        test: () => {
          // Academic notes, research papers
          return /research|paper|note|study/i.test(title) &&
                 wordCount >= 500 &&
                 headingCount >= 3;
        },
        confidence: 0.80
      },

      // ③ Form (输入页面) 📋
      {
        type: 'form',
        subtype: 'job_application',
        test: () => /apply|application|career|job/i.test(url) && formFieldCount >= 5,
        confidence: 0.90
      },
      {
        type: 'form',
        subtype: 'survey',
        test: () => /survey|questionnaire|feedback|poll/i.test(url) && formFieldCount >= 3,
        confidence: 0.85
      },
      {
        type: 'form',
        subtype: 'registration',
        test: () => /signup|register|join|account/i.test(url) && formFieldCount >= 2,
        confidence: 0.85
      },
      {
        type: 'form',
        subtype: 'wizard',
        test: () => /step|wizard|checkout/i.test(url) && formFieldCount >= 3,
        confidence: 0.80
      },

      // ④ Article/Content (内容型页面) 📄
      {
        type: 'content',
        subtype: 'tutorial',
        test: () => {
          // Tutorial with code blocks and steps
          return /tutorial|how-to|guide|learn/i.test(title) &&
                 hasCodeBlocks &&
                 wordCount >= 200;
        },
        confidence: 0.90
      },
      {
        type: 'content',
        subtype: 'blog',
        test: () => {
          // Blog posts (continuous text, no clear TOC)
          return /blog|post|article/i.test(url) &&
                 wordCount >= 200 &&
                 headingCount <= 5;
        },
        confidence: 0.85
      },
      {
        type: 'content',
        subtype: 'news',
        test: () => {
          // News articles
          return (domain.includes('medium.com') ||
                 domain.includes('substack.com') ||
                 /news|press|article/i.test(url)) &&
                 wordCount >= 200;
        },
        confidence: 0.80
      },
      {
        type: 'content',
        subtype: 'review',
        test: () => /review|rating|comparison/i.test(title) && wordCount >= 200,
        confidence: 0.75
      },

      // ⑤ Social Stream (信息流) 💬
      {
        type: 'social',
        subtype: 'twitter',
        test: () => domain.includes('twitter.com') || domain.includes('x.com'),
        confidence: 0.95
      },
      {
        type: 'social',
        subtype: 'reddit',
        test: () => domain.includes('reddit.com'),
        confidence: 0.95
      },
      {
        type: 'social',
        subtype: 'instagram',
        test: () => domain.includes('instagram.com'),
        confidence: 0.95
      },
      {
        type: 'social',
        subtype: 'forum',
        test: () => /forum|discussion|thread|community/i.test(url),
        confidence: 0.70
      },

      // ⑥ Misc/Utility (工具页) ⚙️
      {
        type: 'utility',
        subtype: 'dashboard',
        test: () => /dashboard|admin|console|panel/i.test(url) && wordCount < 200,
        confidence: 0.85
      },
      {
        type: 'utility',
        subtype: 'editor',
        test: () => /edit|editor|compose|write/i.test(url) && hasTextarea,
        confidence: 0.80
      },
      {
        type: 'utility',
        subtype: 'viewer',
        test: () => /view|preview|pdf|reader/i.test(url) && wordCount < 100,
        confidence: 0.75
      },
      {
        type: 'utility',
        subtype: 'sandbox',
        test: () => /sandbox|playground|fiddle|repl/i.test(url),
        confidence: 0.85
      }
    ];

    // Find best matching classification
    let bestMatch = { type: 'unknown', subtype: 'general', confidence: 0.5, indicators: {} };

    for (const classification of classifications) {
      if (classification.test()) {
        if (classification.confidence > bestMatch.confidence) {
          bestMatch = {
            type: classification.type,
            subtype: classification.subtype,
            confidence: classification.confidence,
            indicators: {
              domain,
              urlPattern: url,
              titlePattern: title
            }
          };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      return urlObj.hostname ? urlObj.hostname.toLowerCase() : '';
    } catch (error) {
      return '';
    }
  }

  /**
   * Track visit to a URL
   * @param {string} url - Page URL
   * @returns {object} - Visit statistics
   */
  async trackVisit(url) {
    await this.init(); // Ensure visit history is loaded

    const normalizedUrl = this.normalizeUrl(url);
    const now = Date.now();

    // Initialize visit record if doesn't exist
    if (!this.visitHistory[normalizedUrl]) {
      this.visitHistory[normalizedUrl] = {
        url: url,
        normalizedUrl: normalizedUrl,
        visits: [],
        firstVisit: now,
        lastVisit: now,
        count: 0
      };
    }

    const record = this.visitHistory[normalizedUrl];

    // Add new visit
    record.visits.push({
      timestamp: now,
      action: 'visit'
    });
    record.lastVisit = now;
    record.count = record.visits.length;

    // Keep only last 50 visits to avoid bloat
    if (record.visits.length > 50) {
      record.visits = record.visits.slice(-50);
    }

    // Save updated history
    await chrome.storage.local.set({ visitHistory: this.visitHistory });

    return this.getVisitStatistics(normalizedUrl);
  }

  /**
   * Get visit statistics for a URL
   */
  getVisitStatistics(normalizedUrl) {
    const record = this.visitHistory[normalizedUrl];

    if (!record) {
      return {
        isRepeatedVisit: false,
        visitCount: 0,
        frequency: 0,
        lastVisit: null,
        daysSinceFirst: 0
      };
    }

    const now = Date.now();
    const daysSinceFirst = (now - record.firstVisit) / (1000 * 60 * 60 * 24);
    const frequency = daysSinceFirst > 0 ? record.count / daysSinceFirst : 0;

    return {
      isRepeatedVisit: record.count > 1,
      visitCount: record.count,
      frequency: frequency, // visits per day
      lastVisit: new Date(record.lastVisit).toISOString(),
      daysSinceFirst: Math.floor(daysSinceFirst),
      timeSinceLastVisit: now - record.lastVisit
    };
  }

  /**
   * Normalize URL for comparison (remove query params and hash)
   */
  normalizeUrl(url) {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      let normalized = `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
      normalized = normalized.replace(/\/$/, '');
      return normalized.toLowerCase();
    } catch (error) {
      return typeof url === 'string' ? url.toLowerCase() : '';
    }
  }

  /**
   * Detect user editing pattern
   */
  detectEditingPattern(context) {
    const { metadata } = context;

    return {
      isEditable: metadata.isEditable || false,
      hasTextarea: metadata.hasTextarea || false,
      isContentEditable: metadata.isContentEditable || false,
      likelyAuthoring: (metadata.hasTextarea || metadata.isContentEditable) && metadata.wordCount > 100
    };
  }

  /**
   * Get temporal context
   */
  getTemporalContext() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday

    return {
      hour: hour,
      dayOfWeek: day,
      isWorkingHours: hour >= 9 && hour < 18 && day >= 1 && day <= 5,
      isWeekend: day === 0 || day === 6,
      timeOfDay: this.getTimeOfDay(hour)
    };
  }

  /**
   * Get time of day classification
   */
  getTimeOfDay(hour) {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  /**
   * Main perception method - gather all context
   * @param {object} pageContext - Context from content script
   * @returns {object} - Complete perception data
   */
  async observe(pageContext) {
    await this.init();

    const pageType = this.classifyPageType(pageContext);
    const visitStats = this.getVisitStatistics(this.normalizeUrl(pageContext.url));
    const editingPattern = this.detectEditingPattern(pageContext);
    const temporal = this.getTemporalContext();

    const perception = {
      // Page information
      currentPage: {
        url: pageContext.url,
        title: pageContext.title,
        domain: this.extractDomain(pageContext.url),
        pageType: pageType.type,
        pageSubtype: pageType.subtype,
        confidence: pageType.confidence,
        wordCount: pageContext.metadata.word_count,
        formFieldCount: pageContext.metadata.formFieldCount || 0
      },

      // User behavior patterns
      userBehavior: {
        ...visitStats,
        editingPattern: editingPattern
      },

      // Temporal context
      temporal: temporal,

      // Metadata
      metadata: {
        observedAt: new Date().toISOString(),
        perceptionVersion: '1.0'
      }
    };

    console.log('[AutoFeel Perception] Observed context:', perception);

    return perception;
  }
}

// Create singleton instance
const perceptionAgent = new PerceptionAgent();

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = perceptionAgent;
}
