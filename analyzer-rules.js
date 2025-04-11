class ContractRules {
  // 添加规则定义
  static rules = {
    checkTwitterTokens: {
      name: '推特发币历史',
      description: '检查推特账号的发币历史'
    },
    checkTwitterModifications: {
      name: '推特异常修改历史',
      description: '检查推特账号的异常修改记录'
    },
    checkCreatorTokens: {
      name: '创建者发币历史',
      description: '检查创建者的发币历史'
    }
  };

  // API 基础配置
  static API_CONFIG = {
    PUMP_TOOLS: {
      BASE_URL: 'https://pumptools.me/api/extension',
      ENDPOINTS: {
        TWITTER_TOKENS: '/get_x_tokens_history',  // 推特账号发币历史
        TWITTER_MODIFICATIONS: '/get_x_modification_logs',  // 推特账号异常修改历史
        CREATOR_TOKENS: '/get_creator_info'  // 创建者发币历史
      }
    }
  };

  // 静态属性存储数据
  static currentData = null;
  static currentModificationData = null;
  static currentCreatorData = null;

  // 添加当前合约地址属性
  static currentContractAddress = null;

  // 类型标签映射
  static TYPE_LABELS = {
    'modify_description': '修改简介',
    'delete_tweet': '删除推文',
    'modify_name': '修改名称',
    'modify_profile': '修改头像'
  };

  // 通用方法
  static async makeRequest(endpoint, payload, description) {
    try {
      const url = `${this.API_CONFIG.PUMP_TOOLS.BASE_URL}${endpoint}`;
      console.log(`准备发送${description}请求:`, url, payload);

      const storage = await chrome.storage.local.get(['walletAddress', 'token']);
      const { walletAddress, token } = storage;
      payload.user_id = walletAddress;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      // 如果是 401 或 403，抛出特定错误
      if (response.status === 401 || response.status === 403) {
        const error = new Error('NeedVip');
        error.status = response.status;
        error.emptyData = { data: [] };  // 添加空数据
        throw error;
      }

      if (!response.ok) {
        // 其他错误返回空数据
        return { data: [] };
      }

      const result = await response.json();
      console.log(`${description}响应数据:`, result);
      return result;
    } catch (error) {
      console.warn(`${description}失败:`, error);
      if (error.message === 'NeedVip') {
        throw error;  // 继续抛出 NeedVip 错误
      }
      // 其他错误返回空数据
      return { data: [] };
    }
  }

  // 通用格式化方法
  static formatMarketCap(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return '-';
    return num >= 1000
      ? `$${(num/1000).toFixed(2)}K`
      : `$${num.toFixed(2)}`;
  }

  static getTokenRiskStyle(totalTokens, highValueTokens) {
    if (totalTokens > 0 && highValueTokens === 0) return 'high-risk';
    if (highValueTokens === 1) return 'medium-risk';
    if (highValueTokens > 1) return 'low-risk';
    return '';
  }

  static getModificationRiskStyle(total) {
    return total > 0 ? 'high-risk' : '';
  }

  // 通用统计信息生成
  static generateStatsHtml(data, type) {
    const totalItems = data.length;
    const highValueCount = type !== 'modifications'
      ? data.filter(token => parseFloat(token.market_cap) > 10000).length
      : null;

    const chainStats = type !== 'modifications'
      ? data.reduce((acc, item) => {
          acc[item.chain_name] = (acc[item.chain_name] || 0) + 1;
          return acc;
        }, {})
      : null;

    const typeStats = type === 'modifications'
      ? data.reduce((acc, item) => {
          acc[item.modify_type] = (acc[item.modify_type] || 0) + 1;
          return acc;
        }, {})
      : null;

    let statsHtml = '';

    if (type !== 'modifications') {
      statsHtml = `
        <div class="stat-item">
          <span class="stat-label">市值>$10000的代币数量:</span>
          <span class="stat-value ${this.getTokenRiskStyle(totalItems, highValueCount)}">${highValueCount} 个</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">总计发币次数:</span>
          <span class="stat-value">${totalItems} 次</span>
        </div>
        ${Object.entries(chainStats).map(([chain, count]) => `
          <div class="stat-item">
            <span class="stat-label">${chain}:</span>
            <span class="stat-value">${count} 个代币</span>
          </div>
        `).join('')}`;
    } else {
      statsHtml = `
        <div class="stat-item">
          <span class="stat-label">总计修改次数:</span>
          <span class="stat-value ${this.getModificationRiskStyle(totalItems)}">${totalItems} 次</span>
        </div>
        ${Object.entries(typeStats).map(([type, count]) => `
          <div class="stat-item">
            <span class="stat-label">${this.TYPE_LABELS[type] || type}:</span>
            <span class="stat-value">${count} 次</span>
          </div>
        `).join('')}`;
    }

    return statsHtml;
  }

  // 修改获取链接的辅助方法
  static getContractLink(chain, address) {
    // 只支持 BNB Chain 和 Solana 的链接跳转
    if (chain === 'Solana') {
      return `<a href="https://gmgn.ai/sol/token/${address}" target="_blank" class="contract-link">${address}</a>`;
    } else if (chain === 'BNB Chain') {
      return `<a href="https://gmgn.ai/bsc/token/${address}" target="_blank" class="contract-link">${address}</a>`;
    }

    // 其他链只显示地址，不生成链接
    return address;
  }

  // 修改表格生成代码
  static generateTableHtml(data, type, pageSize = 5) {
    const totalPages = Math.ceil(data.length / pageSize);
    const paginationHtml = `
      <div class="pagination">
        <button class="page-btn prev-btn" data-direction="prev" ${type !== 'tokens' ? `data-type="${type}"` : ''} disabled>上一页</button>
        <span class="page-info">第 <span class="current-page">1</span>/${totalPages} 页</span>
        <button class="page-btn next-btn" data-direction="next" ${type !== 'tokens' ? `data-type="${type}"` : ''} ${totalPages <= 1 ? 'disabled' : ''}>下一页</button>
      </div>
    `;

    let tableRows;
    if (type === 'modifications') {
      tableRows = data.slice(0, pageSize).map(item => `
        <tr>
          <td>${this.TYPE_LABELS[item.modify_type] || item.modify_type}</td>
          <td style="width: 65%; word-break: break-all; white-space: pre-wrap;" class="modification-content">${item.modification_log.replace(/\n/g, '<br>')}</td>
          <td>${item.gmt_modify}</td>
        </tr>
      `).join('');
    } else {
      tableRows = data.slice(0, pageSize).map(token => {
        const isCurrentContract = this.currentContractAddress &&
          token.token_address.toLowerCase() === this.currentContractAddress;

        return `
          <tr ${isCurrentContract ? 'class="current-contract"' : ''}>
            <td>${token.chain_name}</td>
            <td>${token.token_symbol}</td>
            <td class="monospace">${this.getContractLink(token.chain_name, token.token_address)}</td>
            <td>${this.formatMarketCap(token.market_cap)}</td>
          </tr>
        `;
      }).join('');
    }

    return { tableRows, paginationHtml };
  }

  // 格式化方法
  static formatTwitterTokensData(data) {
    this.currentData = data;
    if (!data?.length) {
      return this.formatEmptyData('推特发币历史');
    }

    const statsHtml = this.generateStatsHtml(data, 'tokens');
    const { tableRows, paginationHtml } = this.generateTableHtml(data, 'tokens');

    return this.generateSectionHtml('推特发币历史', statsHtml, tableRows, paginationHtml);
  }

  static formatTwitterModificationsData(data) {
    this.currentModificationData = data;
    if (!data?.length) {
      return this.formatEmptyData('推特异常修改历史');
    }

    const statsHtml = this.generateStatsHtml(data, 'modifications');
    const { tableRows, paginationHtml } = this.generateTableHtml(data, 'modifications', 3);

    return this.generateSectionHtml('推特异常修改历史', statsHtml, tableRows, paginationHtml, true);
  }

  static formatCreatorTokensData(data) {
    this.currentCreatorData = data;
    if (!data?.length) {
      return this.formatEmptyData('创建者发币历史');
    }

    const statsHtml = this.generateStatsHtml(data, 'creator');
    const { tableRows, paginationHtml } = this.generateTableHtml(data, 'creator');

    return this.generateSectionHtml('创建者发币历史', statsHtml, tableRows, paginationHtml);
  }

  // 辅助方法
  static formatEmptyData(title) {
    // 只在创建者发币历史的标题后添加说明
    const titleWithNote = title === '创建者发币历史'
      ? `${title}（最多获取最近10条记录）`
      : title;

    return `
      <div class="section-card">
        <h3 class="section-title">${titleWithNote}</h3>
        <div class="stats-grid no-data">
          <div class="stat-item">
            <span class="stat-value">未发现记录</span>
          </div>
        </div>
      </div>
    `;
  }

  static generateSectionHtml(title, statsHtml, tableRows, paginationHtml, isModification = false) {
    const tableHeaders = isModification
      ? '<th>修改类型</th><th>修改内容</th><th style="min-width: 150px">修改时间</th>'
      : '<th>链</th><th>代币符号</th><th>合约地址</th><th>市值</th>';

    const titleWithNote = title === '创建者发币历史'
      ? `${title}（最多获取最近10条记录）`
      : title;

    // 根据类型获取正确的数据长度
    let dataLength;
    if (isModification) {
      dataLength = this.currentModificationData?.length || 0;
    } else if (title === '创建者发币历史') {
      dataLength = this.currentCreatorData?.length || 0;
    } else {
      dataLength = this.currentData?.length || 0;
    }

    return `
      <div class="section-card">
        <h3 class="section-title">${titleWithNote}</h3>
        <div class="stats-grid warning-bg">
          ${statsHtml}
        </div>
        <div class="table-container" data-total-items="${dataLength}" data-page-size="5" data-type="${title === '推特异常修改历史' ? 'modifications' : title === '创建者发币历史' ? 'creator' : 'tokens'}">
          <table class="${isModification ? 'modifications-table' : 'tokens-table'}" style="${isModification ? 'table-layout: fixed; width: 100%;' : ''}">
            <thead>
              <tr>${tableHeaders}</tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          ${paginationHtml}
        </div>
      </div>
    `;
  }

  // API 调用方法
  static async fetchTwitterTokens(twitterUrl) {
    if (!twitterUrl.startsWith('http')) {
      twitterUrl = `https://x.com/${twitterUrl}`;
    }
    return this.makeRequest(
      this.API_CONFIG.PUMP_TOOLS.ENDPOINTS.TWITTER_TOKENS,
      { twitter_url: twitterUrl },
      '推特发币历史'
    );
  }

  static async fetchTwitterModifications(twitterUrl) {
    if (!twitterUrl.startsWith('http')) {
      twitterUrl = `https://x.com/${twitterUrl}`;
    }
    return this.makeRequest(
      this.API_CONFIG.PUMP_TOOLS.ENDPOINTS.TWITTER_MODIFICATIONS,
      { twitter_url: twitterUrl },
      '推特异常修改'
    );
  }

  static async fetchCreatorTokens(chain, address) {
    return this.makeRequest(
      this.API_CONFIG.PUMP_TOOLS.ENDPOINTS.CREATOR_TOKENS,
      {
        chain: chain,
        token_address: address  // 使用合约地址
      },
      '创建者发币历史'
    );
  }

  // 数据处理方法
  static processTwitterTokens(data) {
    // TODO: 处理推特发币历史数据的逻辑
    return {
      level: 'info',
      message: '推特发币历史检查完成',
      details: this.formatTwitterTokensData(data)
    };
  }

  static processTwitterModifications(data) {
    // TODO: 处理推特异常修改历史数据的逻辑
    return {
      level: 'info',
      message: '推特异常修改检查完成',
      details: this.formatTwitterModificationsData(data)
    };
  }

  static processCreatorTokens(data) {
    // TODO: 处理创建者发币历史数据的逻辑
    return {
      level: 'info',
      message: '创建者发币历史检查完成',
      details: this.formatCreatorTokensData(data)
    };
  }

  // 获取当前数据的方法
  static getCurrentData() {
    return this.currentData;
  }

  // 更新分页切换方法
  static changePage(button, direction) {
    const container = button.closest('.table-container');
    const type = container.dataset.type || 'tokens';  // 默认为tokens类型
    // 根据类型获取正确的数据源
    let data;
    if (type === 'modifications') {
      data = this.currentModificationData;
    } else if (type === 'creator') {
      data = this.currentCreatorData;
    } else if (type === 'tokens') {
      data = this.currentData;
    }

    if (!data) return;

    const tbody = container.querySelector('tbody');
    const currentPageSpan = container.querySelector('.current-page');
    const prevBtn = container.querySelector('.prev-btn');
    const nextBtn = container.querySelector('.next-btn');

    const totalItems = parseInt(container.dataset.totalItems);
    const pageSize = parseInt(container.dataset.pageSize);
    const totalPages = Math.ceil(totalItems / pageSize);
    const currentPage = parseInt(currentPageSpan.textContent);

    let newPage = direction === 'next' ? currentPage + 1 : currentPage - 1;

    // 更新页码
    currentPageSpan.textContent = newPage;

    // 更新按钮状态
    prevBtn.disabled = newPage === 1;
    nextBtn.disabled = newPage === totalPages;

    // 获取新页面的数据
    const start = (newPage - 1) * pageSize;
    const end = Math.min(start + pageSize, totalItems);

    // 确保数据存在且长度正确
    if (!data || start >= data.length) {
      console.error('数据不存在或页码超出范围');
      return;
    }

    // 根据表格类型生成不同的行内容
    let newRows;
    if (type === 'modifications') {
      newRows = data.slice(start, end).map(item => {
        const typeLabel = this.TYPE_LABELS[item.modify_type] || item.modify_type;

        return `
          <tr>
            <td style="width: 15%">${typeLabel}</td>
            <td style="width: 65%; word-break: break-all; white-space: pre-wrap;" class="modification-content">${item.modification_log.replace(/\n/g, '<br>')}</td>
            <td style="width: 20%">${item.gmt_modify}</td>
          </tr>
        `;
      }).join('');
    } else {
      newRows = data.slice(start, end).map(token => {
        const isCurrentContract = this.currentContractAddress &&
          token.token_address.toLowerCase() === this.currentContractAddress;

        return `
          <tr ${isCurrentContract ? 'class="current-contract"' : ''}>
            <td>${token.chain_name}</td>
            <td>${token.token_symbol}</td>
            <td class="monospace">${this.getContractLink(token.chain_name, token.token_address)}</td>
            <td>${this.formatMarketCap(token.market_cap)}</td>
          </tr>
        `;
      }).join('');
    }

    tbody.innerHTML = newRows;
  }

  static formatErrorData(message) {
    return `
      <div class="section-card error-section">
        <h3 class="section-title">错误信息</h3>
        <div class="error-message">${message}</div>
      </div>
    `;
  }

  // 修改 analyze 方法，保存当前合约地址
  static async analyze(pageData) {
    // 保存当前合约地址，转换为小写以便比较
    this.currentContractAddress = pageData.contract?.value?.toLowerCase();
    const results = {
      summary: [],
      details: {}
    };

    try {
      // 准备所有需要执行的规则检查
      const ruleChecks = [];

      // 只有在有推特账号时才执行推特相关的检查
      if (pageData.twitter?.value) {
        // 推特发币历史检查
        ruleChecks.push({
          ruleId: 'checkTwitterTokens',
          promise: this.fetchTwitterTokens(pageData.twitter.value),
          processor: this.processTwitterTokens.bind(this)
        });

        // 推特异常修改检查
        ruleChecks.push({
          ruleId: 'checkTwitterModifications',
          promise: this.fetchTwitterModifications(pageData.twitter.value),
          processor: this.processTwitterModifications.bind(this)
        });
      }

      // 创建者发币历史检查
      if (pageData.contract?.value && pageData.contract?.chain) {
        ruleChecks.push({
          ruleId: 'checkCreatorTokens',
          promise: this.fetchCreatorTokens(pageData.contract.chain, pageData.contract.value),
          processor: this.processCreatorTokens.bind(this)
        });
      }

      // 并行执行所有API请求
      const apiResults = await Promise.allSettled(ruleChecks.map(check => check.promise));

      // 处理每个规则的结果
      apiResults.forEach((result, index) => {
        const check = ruleChecks[index];
        const ruleName = this.rules[check.ruleId].name;

        let ruleResult;
        if (result.status === 'fulfilled') {
          ruleResult = check.processor(result.value);
        } else {
          console.error(`规则 ${check.ruleId} 执行失败:`, result.reason);
          ruleResult = {
            level: 'error',
            message: '规则执行失败',
            details: this.formatErrorData('API请求失败: ' + result.reason.message)
          };
        }

        results.details[check.ruleId] = {
          name: ruleName,
          ...ruleResult
        };

        results.summary.push({
          ruleId: check.ruleId,
          name: ruleName,
          level: ruleResult.level,
          message: ruleResult.message
        });
      });

      // 如果没有推特账号，在汇总中显示相应信息
      if (!pageData.twitter?.value) {
        const noTwitterMessage = '该代币未绑定推特账号';
        ['checkTwitterTokens', 'checkTwitterModifications'].forEach(ruleId => {
          results.details[ruleId] = {
            name: this.rules[ruleId].name,
            level: 'info',
            message: noTwitterMessage,
            details: this.formatEmptyData(this.rules[ruleId].name)
          };

          results.summary.push({
            ruleId,
            name: this.rules[ruleId].name,
            level: 'info',
            message: noTwitterMessage
          });
        });
      }

    } catch (error) {
      if (error.name === 'NeedVip') {
        throw error;  // 继续向上抛出错误
      }
      console.error('规则执行过程中发生错误:', error);
      // 处理整体执行过程中的错误
      for (const [ruleId, rule] of Object.entries(this.rules)) {
        const errorResult = {
          level: 'error',
          message: '规则执行过程发生错误',
          details: this.formatErrorData('执行过程发生错误: ' + error.message)
        };

        results.details[ruleId] = {
          name: rule.name,
          ...errorResult
        };

        results.summary.push({
          ruleId,
          name: rule.name,
          level: errorResult.level,
          message: errorResult.message
        });
      }
    }

    return results;
  }

  // 添加事件监听器设置方法
  static setupPaginationListeners() {
    document.querySelectorAll('.page-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        const direction = e.target.dataset.direction;
        if (direction) {
          this.changePage(e.target, direction);
        }
      });
    });
  }

  // 添加汇总信息格式化方法
  static formatSummaryData(analysisResults) {
    // 从三个接口的数据中提取信息
    // 确保数据是数组
    const creatorData = Array.isArray(this.currentCreatorData) ? this.currentCreatorData : [];
    const twitterData = Array.isArray(this.currentData) ? this.currentData : [];
    const modificationData = Array.isArray(this.currentModificationData) ? this.currentModificationData : [];

    // 计算汇总统计
    const totalCreatorTokens = creatorData.length;
    const totalTwitterTokens = twitterData.length;
    const totalModifications = modificationData.length;

    // 计算高市值代币
    const highValueCreatorTokens = creatorData.filter(token => parseFloat(token.market_cap) > 10000).length;
    const highValueTwitterTokens = twitterData.filter(token => parseFloat(token.market_cap) > 10000).length;

    // 生成汇总HTML
    return `
      <div class="section-card summary-card">
        <h3 class="section-title">风险分析汇总</h3>
        <div class="stats-grid warning-bg">
          <div class="stat-item">
            <span class="stat-label">创建者发币总数（最多观察最近10次）:</span>
            <span class="stat-value">${totalCreatorTokens} 个</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">创建者高市值代币数(>$10000):</span>
            <span class="stat-value ${this.getTokenRiskStyle(totalCreatorTokens, highValueCreatorTokens)}">${highValueCreatorTokens} 个</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">推特发币总数:</span>
            <span class="stat-value">${totalTwitterTokens} 个</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">推特高市值代币数(>$10000):</span>
            <span class="stat-value ${this.getTokenRiskStyle(totalTwitterTokens, highValueTwitterTokens)}">${highValueTwitterTokens} 个</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">推特异常修改次数:</span>
            <span class="stat-value ${this.getModificationRiskStyle(totalModifications)}">${totalModifications} 次</span>
          </div>
        </div>
      </div>
    `;
  }

  // 修改 getResultHTML 方法
  static getResultHTML(analysisResults) {
    let html = '<div class="analysis-results">';

    // 添加汇总信息
    html += this.formatSummaryData(analysisResults);

    // 定义展示顺序
    const displayOrder = [
      'checkCreatorTokens',      // 创建者发币历史
      'checkTwitterModifications', // 推特异常修改历史
      'checkTwitterTokens'        // 推特发币历史
    ];

    // 按照指定顺序展示结果
    for (const ruleId of displayOrder) {
      const detail = analysisResults.details[ruleId];
      if (detail?.details) {
        html += `
          <div class="detail-section">
            ${detail.details}
          </div>
        `;
      }
    }
    html += '</div>';

    // 使用 setTimeout 确保 DOM 已更新
    setTimeout(() => {
      this.setupPaginationListeners();
    }, 0);

    return html;
  }
}

// 导出分析规则类
window.ContractRules = ContractRules;