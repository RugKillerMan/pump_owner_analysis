// 注入脚本到页面环境
let isInitialized = false;
let initializationPromise = null;

function injectScript() {
    return new Promise((resolve, reject) => {
        try {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('inject.js');

            script.onload = () => {
                script.remove();
                isInitialized = true;
                resolve();
            };

            script.onerror = (error) => {
                console.error('Failed to inject script:', error);
                reject(error);
            };

            (document.head || document.documentElement).appendChild(script);
        } catch (error) {
            console.error('Failed to inject script:', error);
            reject(error);
        }
    });
}

// 确保脚本只被注入一次
async function ensureInitialized() {
    if (isInitialized) return Promise.resolve();
    if (initializationPromise) return initializationPromise;

    initializationPromise = injectScript().catch(async (error) => {
        console.error('Initial injection failed, retrying...', error);
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 500));
        return injectScript();
    });

    return initializationPromise;
}

// 在页面加载时注入脚本
ensureInitialized().catch(error => {
    console.error('Failed to initialize:', error);
});

// 处理来自注入脚本的消息
window.addEventListener('message', (event) => {
    // 确保消息来自我们的扩展
    if (event.data.source !== 'GMGN_EXTENSION') return;

    console.log('Received message in content script:', event.data);

    // 转发消息给扩展
    try {
        chrome.runtime.sendMessage(event.data).catch(error => {
            console.error('Failed to send message to extension:', error);
            // 如果是扩展上下文失效，尝试重新注入脚本
            if (error.message.includes('Extension context invalidated')) {
                isInitialized = false;
                initializationPromise = null;
                ensureInitialized().catch(error => {
                    console.error('Failed to reinitialize:', error);
                });
            }
        });
    } catch (error) {
        console.error('Failed to send message:', error);
    }
});

// 处理来自扩展的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message from extension:', message);

    // 确保脚本已初始化
    ensureInitialized().then(() => {
        // 转发消息给注入脚本
        window.postMessage({
            ...message,
            source: 'GMGN_EXTENSION'
        }, '*');

        // 立即发送响应，不保持消息通道开放
        sendResponse({ success: true });
    }).catch(error => {
        console.error('Failed to initialize script:', error);
        // 发送错误消息回扩展
        try {
            chrome.runtime.sendMessage({
                type: 'ERROR',
                error: 'Failed to initialize wallet detection',
                details: error.message
            });
            // 发送错误响应
            sendResponse({ success: false, error: error.message });
        } catch (error) {
            console.error('Failed to send error message:', error);
            sendResponse({ success: false, error: 'Failed to send error message' });
        }
    });

    // 不返回 true，表示我们会同步处理响应
    return false;
});

// 监听来自扩展的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CONNECT_WALLET') {
        // 注入脚本
        injectScript('inject.js').then(() => {
            // 发送连接请求到注入的脚本
            window.postMessage({
                type: 'CONNECT_WALLET',
                wallet: message.wallet
            }, '*');
        });
        return true;
    } else if (message.type === 'DISCONNECT_WALLET') {
        // 注入脚本
        injectScript('inject.js').then(() => {
            // 发送断开连接请求到注入的脚本
            window.postMessage({
                type: 'DISCONNECT_WALLET',
                wallet: message.wallet
            }, '*');
        });
        return true;
    }
});

// 监听来自注入脚本的消息
window.addEventListener('message', (event) => {
    if (event.data.type === 'WALLET_CONNECTED') {
        // 转发连接结果到扩展
        chrome.runtime.sendMessage(event.data);
    } else if (event.data.type === 'WALLET_DISCONNECTED') {
        // 转发断开连接结果到扩展
        chrome.runtime.sendMessage(event.data);
    }
});