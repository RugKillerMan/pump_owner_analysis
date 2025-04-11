// 当页面加载完成时设置事件监听器
document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.querySelector('.login-button');
    const logoutButton = document.querySelector('.logout-button');
    const modal = document.querySelector('.wallet-modal');
    const closeModal = document.querySelector('.close-modal');
    const walletOptions = document.querySelectorAll('.wallet-option');
    const userInfo = document.querySelector('.user-info');
    const username = document.querySelector('.username');
    let currentMessageListener = null;

    // 获取当前活动标签页并发送消息
    async function sendMessageToActiveTab(message) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error('No active tab found');

            // 注入内容脚本
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content-script.js']
            });

            // 等待内容脚本初始化
            await new Promise(resolve => setTimeout(resolve, 500));

            return chrome.tabs.sendMessage(tab.id, message);
        } catch (error) {
            console.error('Failed to send message:', error);
            throw error;
        }
    }

    // 创建消息监听器
    function createMessageListener(resolve) {
        // 移除之前的监听器
        if (currentMessageListener) {
            chrome.runtime.onMessage.removeListener(currentMessageListener);
        }

        // 创建新的监听器
        const listener = async (message) => {
            console.log('Received message:', message);

            if (message.type === 'WALLET_CONNECTED') {
                if (loginButton) {
                    loginButton.disabled = false;
                }

                if (message.success) {
                    const address = message.publicKey || message.accounts?.[0];
                    if (!address) {
                        console.error('连接成功但未获取到地址');
                        resolve();
                        return;
                    }

                    if (username && userInfo && loginButton) {
                        username.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
                        loginButton.style.display = 'none';
                        userInfo.style.display = 'flex';

                        // 存储连接状态
                        chrome.storage.local.set({
                            walletConnected: true,
                            walletType: message.wallet,
                            walletAddress: address
                        });
                    }
                } else {
                    let errorMessage = message.error || '连接失败';
                    if (message.code === 4001) {
                        errorMessage = '用户拒绝了连接请求';
                    }
                    console.error(`连接失败: ${errorMessage}`);
                }
                resolve();
            }
        };

        currentMessageListener = listener;
        chrome.runtime.onMessage.addListener(listener);
        return listener;
    }

    // 初始化隐藏用户信息
    if (userInfo) {
        userInfo.style.display = 'none';
    }

    // 显示钱包选择弹窗
    if (loginButton) {
        loginButton.addEventListener('click', () => {
            if (modal) {
                modal.style.display = 'flex';
            }
        });
    }

    // 关闭弹窗
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            if (modal) {
                modal.style.display = 'none';
            }
        });
    }

    // 点击弹窗外部关闭
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    // 处理钱包选择
    if (walletOptions) {
        walletOptions.forEach(option => {
            option.addEventListener('click', async () => {
                const walletType = option.dataset.wallet;
                if (modal) {
                    modal.style.display = 'none';
                }
                if (loginButton) {
                    loginButton.disabled = true;
                }

                try {
                    // 创建一个 Promise 来处理整个连接流程
                    await new Promise(async (resolve) => {
                        // 设置监听器
                        const listener = createMessageListener(resolve);

                        // 设置超时
                        const timeout = setTimeout(() => {
                            chrome.runtime.onMessage.removeListener(listener);
                            console.error('连接超时，请重试');
                            if (loginButton) {
                                loginButton.disabled = false;
                            }
                            resolve();
                        }, 30000);

                        try {
                            // 发送连接请求
                            await sendMessageToActiveTab({
                                type: 'CONNECT_WALLET',
                                wallet: walletType
                            });
                        } catch (error) {
                            console.error('Failed to connect wallet:', error);
                            if (loginButton) {
                                loginButton.disabled = false;
                            }
                            clearTimeout(timeout);
                            resolve();
                        }
                    });
                } catch (error) {
                    console.error('连接失败:', error);
                } finally {
                    if (loginButton) {
                        loginButton.disabled = false;
                    }
                }
            });
        });
    }

    // 处理登出
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            if (loginButton && userInfo) {
                try {
                    // 禁用登出按钮，防止重复点击
                    logoutButton.disabled = true;

                    // 获取当前连接的钱包类型
                    const { walletType } = await chrome.storage.local.get('walletType');

                    // 注入内容脚本并发送断开连接请求
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content-script.js']
                    });

                    // 发送断开连接请求
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'DISCONNECT_WALLET',
                        wallet: walletType
                    });

                    // 立即更新 UI 和清除状态
                    loginButton.style.display = 'block';
                    userInfo.style.display = 'none';
                    chrome.storage.local.remove(['walletConnected', 'walletAddress', 'walletType']);

                    // 重置会员状态显示
                    const membershipStatus = document.getElementById('membershipStatus');
                    const purchaseLink = document.getElementById('purchaseLink');
                    if (membershipStatus) {
                        membershipStatus.textContent = '请先连接钱包';
                        membershipStatus.className = 'status-value non-member';
                    }
                    if (purchaseLink) {
                        purchaseLink.style.display = 'flex';
                    }

                } catch (error) {
                    console.error('Logout error:', error);
                } finally {
                    // 重新启用登出按钮
                    logoutButton.disabled = false;
                }
            }
        });
    }

    // 检查已存储的连接状态
    chrome.storage.local.get(['walletConnected', 'walletAddress'], (result) => {
        if (result.walletConnected && result.walletAddress && username && userInfo && loginButton) {
            username.textContent = `${result.walletAddress.slice(0, 6)}...${result.walletAddress.slice(-4)}`;
            loginButton.style.display = 'none';
            userInfo.style.display = 'flex';
        }
    });
});

// 监听来自注入脚本的消息
window.addEventListener('message', async (event) => {
    // 确保消息来自我们的扩展
    if (event.data.source !== 'GMGN_EXTENSION') return;

    console.log('Received message:', event.data);

    if (event.data.type === 'WALLET_CONNECTED' && event.data.success) {
        // 保存钱包信息到 chrome.storage
        try {
            await chrome.storage.local.set({
                walletAddress: event.data.publicKey,
                walletType: event.data.walletType
            });
            console.log('Wallet info saved to storage:', {
                walletAddress: event.data.publicKey,
                walletType: event.data.walletType
            });
        } catch (error) {
            console.error('Failed to save wallet info:', error);
        }
    }
});

// 连接钱包
function connectWallet(walletType) {
    return new Promise((resolve, reject) => {
        // 注入连接脚本
        injectScript('inject.js', () => {
            // 发送连接请求
            window.postMessage({
                source: 'GMGN_EXTENSION',
                type: 'CONNECT_WALLET',
                wallet: walletType
            }, '*');
        });
    });
}

// 注入脚本
function injectScript(file, callback) {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(file);
    script.onload = () => {
        callback();
        script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
}

// 导出函数
window.connectWallet = connectWallet;