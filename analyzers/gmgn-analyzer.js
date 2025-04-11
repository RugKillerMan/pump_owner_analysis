class GMGNAnalyzer extends BaseAnalyzer {
  static siteConfigs = {
    'gmgn.ai': [
      {
        xpath: "//div[contains(@class, 'css-1av451l')]/text()",
        type: 'content',
        name: '代币符号',
        process: (text) => text.trim()
      },
      {
        xpath: "//a[contains(@href, '/address/') and .//div[contains(@class, 'css-1h8ua02')]]",
        type: 'creator',
        name: '合约创建者',
        process: (href) => {
          try {
            const match = href.match(/\/([^/]+)\/address\/([^/?]+)/);
            if (match && match[1] && match[2]) {
              const chain = match[1];
              const address = match[2];
              return `${chain}:${address}`;
            }
            return '未找到创建者地址';
          } catch (error) {
            console.error('处理创建者地址失败:', error);
            return '处理创建者地址失败';
          }
        }
      },
      {
        xpath: "//a[(.//div[@data-key='twitter'] or contains(@class, 'css-1wcebk6')) and (contains(@href, 'twitter.com/') or contains(@href, 'x.com/')) and not(contains(@href, '/search?'))]",
        type: 'twitter',
        name: '绑定推特',
        process: (href) => {
          try {
            let username;
            href = href.replace(/^@/, '');
            
            // 匹配 twitter.com/username 或 x.com/username，忽略后面的 status 等内容
            const match = href.match(/(?:twitter|x)\.com\/([^/]+)/);
            if (match && match[1]) {
              username = match[1].split('/')[0];
              username = decodeURIComponent(match[1]);
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

  static analyzeURL(url) {
    this.log('开始分析URL:', url);
    try {
      const urlObj = new URL(url);
      const result = {
        isGMGN: urlObj.hostname.includes('gmgn.ai'),
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
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (configs) => {
          const log = (msg, data) => console.log(`[Page Context] ${msg}`, data || '');
          
          log('开始解析页面元素, 配置:', configs);
          const results = {};

          configs.forEach(config => {
            try {
              // 特殊处理：页面URL
              if (config.special === 'url') {
                results[config.type] = {
                  name: config.name,
                  value: window.location.href
                };
                return;
              }

              log('当前页面URL:', window.location.href);
              log('页面标题:', document.title);
              
              if (config.type === 'content') {
                const xpathResult = document.evaluate(
                  config.xpath,
                  document,
                  null,
                  XPathResult.STRING_TYPE,
                  null
                );
                
                log(`XPath查询结果类型: ${xpathResult.resultType}`);
                const value = xpathResult.stringValue;
                log(`找到的文本:`, value);

                results[config.type] = {
                  name: config.name,
                  value: value.trim() || '未找到'
                };
              } else {
                const element = document.evaluate(
                  config.xpath,
                  document,
                  null,
                  XPathResult.FIRST_ORDERED_NODE_TYPE,
                  null
                ).singleNodeValue;
                log(`找到的元素:`, element);
                
                if (element) {
                  log(`元素类型: ${element.nodeType}`);
                  log(`元素名称: ${element.nodeName}`);
                  log(`元素内容: ${element.textContent}`);
                  log(`直接文本内容:`, element.childNodes[0]?.nodeValue);
                  if (element instanceof HTMLAnchorElement) {
                    log(`链接地址: ${element.href}`);
                    // 对于链接类型，直接存储href
                    results[config.type] = {
                      name: config.name,
                      value: element.href,
                      needsProcessing: true  // 标记需要后续处理
                    };
                    return;  // 跳过后面的处理
                  }
                }

                // 其他类型的处理
                results[config.type] = {
                  name: config.name,
                  value: element ? element.textContent : '未找到'
                };
              }
            } catch (error) {
              log(`解析元素 ${config.name} 失败:`, error);
              results[config.type] = {
                name: config.name,
                value: '解析失败'
              };
            }
          });
          return results;
        },
        args: [this.siteConfigs['gmgn.ai']]
      });

      // 处理结果
      const processedResult = {
        success: true,
        data: {}
      };

      // 先处理基本信息
      Object.entries(result[0].result).forEach(([type, data]) => {
        if (type === 'pageUrl') {
          // 从 pageUrl 中解析合约信息
          const urlParts = data.value.split('/');
          const gmgnIndex = urlParts.findIndex(part => part === 'gmgn.ai');
          
          if (gmgnIndex !== -1 && urlParts.length > gmgnIndex + 3) {
            const chain = urlParts[gmgnIndex + 1];  // 获取链信息 (sol, eth 等)
            const address = urlParts[gmgnIndex + 3];  // 获取合约地址
            
            processedResult.data.contract = {
              name: '合约地址',
              value: address,
              chain: chain
            };
          }
          processedResult.data[type] = data;
        } else if (data.needsProcessing && this.siteConfigs['gmgn.ai'].find(c => c.type === type)?.process) {
          // 处理其他需要处理的数据
          const config = this.siteConfigs['gmgn.ai'].find(c => c.type === type);
          processedResult.data[type] = {
            name: data.name,
            value: config.process(data.value)
          };
        } else {
          processedResult.data[type] = data;
        }
      });

      this.log('页面信息提取成功:', processedResult);
      return processedResult;

    } catch (error) {
      this.log('页面信息提取失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getPageData() {
    const url = window.location.href;
    const data = {
      contract: { value: null, chain: null },
      twitter: { value: null }
    };

    try {
      // 解析URL获取合约信息
      const urlParts = url.split('/');
      const gmgnIndex = urlParts.findIndex(part => part === 'gmgn.ai');
      
      if (gmgnIndex !== -1 && urlParts.length > gmgnIndex + 3) {
        const chain = urlParts[gmgnIndex + 1];  // 获取链信息 (sol, eth 等)
        const address = urlParts[gmgnIndex + 3];  // 获取合约地址
        
        if (chain && address) {
          data.contract = {
            value: address,
            chain: chain
          };
          console.log('解析到合约信息:', data.contract);
        }
      }

      // 获取推特信息
      const twitterElement = document.querySelector('a[href^="https://twitter.com/"], a[href^="https://x.com/"]');
      if (twitterElement) {
        data.twitter.value = twitterElement.href;
      }

    } catch (error) {
      console.error('获取页面数据失败:', error);
    }

    console.log('页面数据:', data);
    return data;
  }

  static updateUI(result, elementId = 'result') {
    this.log('开始更新UI:', result);
    const resultDiv = document.getElementById(elementId);
    const usageGuide = document.querySelector('.usage-guide');
    
    if (!resultDiv) {
      this.log('未找到结果显示元素:', elementId);
      return;
    }

    // 统一错误处理函数
    const showError = () => {
      resultDiv.innerHTML = `
        <div class="result-item error">
          ❌ 请打开GMGN的合约详情页面再点击按钮
        </div>
      `;
    };

    // 检查基本错误情况
    if (!result.success || !result.pageInfo || !result.pageInfo.success) {
      this.log('显示错误信息:', result.error);
      showError();
      return;
    }

    // 检查是否获取到了任何有效信息
    const pageData = result.pageInfo.data;
    const isValidValue = (value) => value && value !== '未找到' && value !== '解析失败';
    
    const hasAnyValidData = pageData && (
      isValidValue(pageData.content?.value) ||
      isValidValue(pageData.contract?.value) ||
      isValidValue(pageData.creator?.value) ||
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

    // 先显示基本信息
    let html = `
      <div class="section-card contract-info">
        <h3 class="section-title">合约基本信息</h3>
        <div class="info-grid">
          ${this.formatContractInfo(pageData)}
        </div>
      </div>
    `;

    // 如果有规则分析结果或正在加载
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
        value: info.contract?.chain || '-'
      },
      'contract': { 
        label: '合约地址', 
        value: info.contract?.value || '-'
      },
      'creator': { 
        label: '合约创建者', 
        value: info.creator?.value ? info.creator.value.split(':')[1] : '-'
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
          <div class="info-value ${key === 'contract' || key === 'creator' ? 'monospace' : ''}">${data.value}</div>
        </div>
      `).join('');
  }
}

window.GMGNAnalyzer = GMGNAnalyzer; 