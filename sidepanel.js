import { Translator } from './translator.js';

let currentLang = 'zh';

// 监听 DOM 变化
const observer = new MutationObserver(async (mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === 1) { // 元素节点
        await Translator.translateElement(node);
      }
    }
  }
});

// 初始化语言切换功能
document.addEventListener('DOMContentLoaded', function() {
  const langSwitch = document.getElementById('langSwitch');
  
  // 语言切换事件
  langSwitch.addEventListener('click', async () => {
    const newLang = Translator.currentLang === 'zh' ? 'en' : 'zh';
    langSwitch.textContent = newLang === 'zh' ? 'English' : '中文';
    await Translator.translatePage(newLang);
  });

  // 开始观察 DOM 变化
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
});

// 分析按钮点击事件
document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const resultDiv = document.getElementById('result');
  
  try {
    // 显示加载状态
    resultDiv.innerHTML = `
      <div class="loading-section">
        <div class="loading-text">
          <div class="loading-spinner"></div>
          <span>${currentLang === 'zh' ? '正在分析合约信息，请稍等...' : 'Analyzing contract information, please wait...'}</span>
        </div>
      </div>
    `;

    // 获取当前标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 获取对应的分析器
    const analyzer = AnalyzerRegistry.getAnalyzerForURL(tab.url);
    if (!analyzer) {
      throw new Error('请打开支持的网站页面');
    }

    // 分析URL
    const urlAnalysis = await analyzer.analyzeURL(tab.url);
    if (!urlAnalysis.success) {
      throw new Error('不支持的网站类型');
    }

    // 获取并展示基本信息
    const pageInfo = await analyzer.extractPageInfo(tab);
    const initialResult = {
      success: true,
      isSupported: true,
      pageInfo: {
        ...pageInfo,
        analysis: {
          isLoading: true
        }
      }
    };
    
    // 立即展示基本信息和加载状态
    analyzer.updateUI(initialResult);

    // 获取规则分析结果
    const analysis = await ContractRules.analyze(pageInfo.data);
    
    // 更新结果
    const finalResult = {
      ...initialResult,
      pageInfo: {
        ...pageInfo,
        analysis: analysis
      }
    };

    // 更新UI，显示完整结果
    analyzer.updateUI(finalResult);

  } catch (error) {
    console.error('分析失败:', error);
    resultDiv.innerHTML = `
      <div class="result-item error">
        ❌ ${currentLang === 'zh' ? error.message || '分析失败，请重试' : error.message || 'Analysis failed, please try again'}
      </div>
    `;
  }
}); 