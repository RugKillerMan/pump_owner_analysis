class AxiomAnalyzer extends BaseAnalyzer {
  static siteConfigs = {
    'axiom.trade': [
      {
        xpath: '/html/body/div[3]/div/div/div/div/div[1]/div[1]/div/div[1]/div[2]/div/div[1]/div[2]/div[1]/span[1]',
        type: 'content',
        name: '代币符号',
        process: (text) => text.trim()
      },
      {
        xpath: '/html/body/div[3]/div/div/div/div/div[1]/div[1]/div/div[1]/div[2]/div/div[1]/div[1]/div[2]/div/div/img',
        type: 'contract',
        name: '合约地址',
        process: (src) => {
          try {
            if (!src) return '未找到合约地址';
            // 从图片 URL 中提取文件名（不包含扩展名）
            const fileName = src.split('/').pop().split('.')[0];
            return fileName || '未找到合约地址';
          } catch (error) {
            console.error('处理合约地址失败:', error);
            return '处理合约地址失败';
          }
        }
      },
      {
        xpath: '/html/body/div[3]/div/div/div/div/div[1]/div[1]/div/div[1]/div[2]/div/div[1]/div[2]/div[2]/span[2]/a',
        type: 'twitter',
        name: '绑定推特',
        process: (href) => {
          try {
            if (!href) return '未找到推特账号';

            let username;
            const match = href.match(/(?:twitter|x)\.com\/([^/]+)/);
            if (match && match[1]) {
              username = match[1].split('/')[0];
              username = decodeURIComponent(username);
              if (['search', 'home', 'explore', 'notifications'].includes(username)) {
                return '未找到推特账号';
              }
              return `https://x.com/${username}`;
            }
            
            return '未找到推特账号';
          } catch (error) {
            console.error('处理推特链接失败:', error);
            return '处理推特链接失败';
          }
        }
      },
      {
        type: 'pageUrl',
        name: '页面链接',
        special: 'url'
      }
    ]
  };

  static chainMapping = {
    'solana': 'sol',
  };

  static analyzeURL(url) {
    this.log('开始分析URL:', url);
    try {
      const urlObj = new URL(url);
      const result = {
        isGMGN: urlObj.hostname.includes('axiom.trade'),
        domain: urlObj.hostname,
        success: true
      };
      this.log('URL分析结果:', result);
      return result;
    } catch (error) {
      this.log('URL分析失败:', error);
      return {
        isGMGN: false,
        error: error.message,
        success: false
      };
    }
  }

  static async extractPageInfo(tab) {
    this.log('开始提取页面信息, tabId:', tab.id);
    try {
      if (!tab.id) {
        throw new Error('无效的标签页ID');
      }

      this.log('准备执行脚本...');
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (configs) => {
          const results = {};
          configs.forEach(config => {
            try {
              if (config.special === 'url') {
                results[config.type] = {
                  name: config.name,
                  value: window.location.href
                };
                return;
              }

              if (config.xpath) {
                if (config.type === 'content') {
                  const xpathResult = document.evaluate(
                    config.xpath,
                    document,
                    null,
                    XPathResult.STRING_TYPE,
                    null
                  );
                  
                  const value = xpathResult.stringValue;
                  results[config.type] = {
                    name: config.name,
                    value: config.process ? config.process(value) : value.trim()
                  };
                } else if (config.type === 'contract') {
                  const element = document.evaluate(
                    config.xpath,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                  ).singleNodeValue;
                  
                  if (element) {
                    // if (element instanceof HTMLImageElement) {
                    results[config.type] = {
                      name: config.name,
                      value: element.src,
                      needsProcessing: true
                    };
                    return;
                    // }
                  }
                  
                  results[config.type] = {
                    name: config.name,
                    value: '未找到'
                  };
                } else {
                  const element = document.evaluate(
                    config.xpath,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                  ).singleNodeValue;
                  
                  if (element) {
                    if (element instanceof HTMLAnchorElement) {
                      results[config.type] = {
                        name: config.name,
                        value: element.href,
                        needsProcessing: true
                      };
                      return;
                    }
                  }

                  results[config.type] = {
                    name: config.name,
                    value: element ? element.textContent : '未找到'
                  };
                }
                return;
              }
            } catch (error) {
              console.error(`解析元素 ${config.name} 失败:`, error);
              results[config.type] = {
                name: config.name,
                value: '解析失败'
              };
            }
          });
          return results;
        },
        args: [this.siteConfigs['axiom.trade']]
      });

      this.log('执行脚本结果:', result);

      const processedResult = {
        success: true,
        data: {}
      };

      // 从 URL 中获取并转换链信息
      let chain = 'sol';

      Object.entries(result[0].result).forEach(([type, data]) => {
        if (type === 'contract') {
          const config = this.siteConfigs['axiom.trade'].find(c => c.type === type);
          processedResult.data[type] = {
            name: data.name,
            value: config.process(data.value),
            chain: chain
          };
        } else if (data.needsProcessing && this.siteConfigs['axiom.trade'].find(c => c.type === type)?.process) {
          // 处理需要后续处理的数据（如推特链接）
          const config = this.siteConfigs['axiom.trade'].find(c => c.type === type);
          processedResult.data[type] = {
            name: data.name,
            value: config.process(data.value)  // 这里传入的是 href 字符串
          };
        } else {
          processedResult.data[type] = data;
        }
      });

      return processedResult;
    } catch (error) {
      this.log('页面信息提取失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  static updateUI(result, elementId = 'result') {
    this.log('开始更新UI:', result);
    const resultDiv = document.getElementById(elementId);
    const usageGuide = document.querySelector('.usage-guide');
    
    if (!resultDiv) {
      this.log('未找到结果显示元素:', elementId);
      return;
    }

    const showError = () => {
      resultDiv.innerHTML = `
        <div class="result-item error">
          ❌ 请打开Axiom的合约详情页面再点击按钮
        </div>
      `;
    };

    if (!result.success || !result.pageInfo || !result.pageInfo.success) {
      this.log('显示错误信息:', result.error);
      showError();
      return;
    }

    const pageData = result.pageInfo.data;
    const isValidValue = (value) => value && value !== '未找到' && value !== '解析失败';
    
    const hasAnyValidData = pageData && (
      isValidValue(pageData.content?.value) ||
      isValidValue(pageData.contract?.value) ||
      isValidValue(pageData.twitter?.value)
    );

    if (!hasAnyValidData) {
      showError();
      return;
    }

    this.log('显示页面详细信息');
    if (usageGuide) {
      usageGuide.style.display = 'none';
    }

    let html = `
      <div class="section-card contract-info">
        <h3 class="section-title">合约基本信息</h3>
        <div class="info-grid">
          ${this.formatContractInfo(pageData)}
        </div>
      </div>
    `;

    if (result.pageInfo.analysis) {
      if (result.pageInfo.analysis.isLoading) {
        html += `
          <div class="section-card loading-section">
            <div class="loading-text">
              <div class="loading-spinner"></div>
              <span>正在分析合约信息，请稍等...</span>
            </div>
          </div>
        `;
      } else {
        html += ContractRules.getResultHTML(result.pageInfo.analysis);
      }
    }

    resultDiv.innerHTML = html;
  }

  static formatContractInfo(info) {
    const formatTwitterValue = (value) => {
      if (value && value.startsWith('https://')) {
        return `<a href="${value}" target="_blank" class="twitter-link">${value.replace('https://x.com/', '@')}</a>`;
      }
      return value || '-';
    };

    const infoMap = {
      'content': { label: '代币符号', value: info.content?.value || '-' },
      'chain': { 
        label: '所属链', 
        value: 'sol'
      },
      'contract': { 
        label: '合约地址', 
        value: info.contract?.value || '-'
      },
      'twitter': { 
        label: '绑定推特', 
        value: formatTwitterValue(info.twitter?.value)
      }
    };

    return Object.entries(infoMap)
      .filter(([key]) => key !== 'pageUrl')
      .map(([key, data]) => `
        <div class="info-row">
          <div class="info-label">${data.label}</div>
          <div class="info-value ${key === 'contract' ? 'monospace' : ''}">${data.value}</div>
        </div>
      `).join('');
  }

  static changePage(button, direction) {
    const container = button.closest('.table-container');
    const type = container.dataset.type || 'tokens';  // 默认为tokens类型
    const data = type === 'modifications' ? this.currentModificationData : 
                 type === 'creator' ? this.currentCreatorData :
                 this.currentData;

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
    
    // 根据表格类型生成不同的行内容
    let newRows;
    if (type === 'modifications') {
      newRows = data.slice(start, end).map(item => {
        const typeLabel = {
          'modify_description': '修改简介',
          'delete_tweet': '删除推文',
          'modify_name': '修改名称',
          'modify_profile': '修改头像'
        }[item.modify_type] || item.modify_type;

        return `
          <tr>
            <td>${typeLabel}</td>
            <td class="modification-content">${item.modification_log}</td>
            <td>${item.gmt_modify}</td>
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
}

// 将分析器注册为全局变量
window.AxiomAnalyzer = AxiomAnalyzer; 