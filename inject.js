// 检测钱包是否存在
function detectWallet(type) {
    if (type === 'okx') {
        return !!(window.okxwallet && window.okxwallet.solana);
    } else if (type === 'phantom') {
        return !!(window.solana && window.solana.isPhantom);
    }
    return false;
}

// 等待钱包就绪
async function waitForPhantom(timeout = 3000) {
    return new Promise((resolve) => {
        let checked = 0;
        const interval = setInterval(() => {
            checked += 100;
            if (window.solana && window.solana.isPhantom) {
                clearInterval(interval);
                resolve(true);
            } else if (checked >= timeout) {
                clearInterval(interval);
                resolve(false);
            }
        }, 100);
    });
}

// 等待 OKX 钱包就绪
async function waitForOKX(timeout = 3000) {
    return new Promise((resolve) => {
        let checked = 0;
        const interval = setInterval(() => {
            checked += 100;
            if (window.okxwallet && window.okxwallet.solana) {
                clearInterval(interval);
                resolve(true);
            } else if (checked >= timeout) {
                clearInterval(interval);
                resolve(false);
            }
        }, 100);
    });
}

// 连接钱包
async function connectWallet(walletType) {
    try {
        if (walletType === 'okx') {
            // 等待 OKX 钱包就绪
            const isReady = await waitForOKX();
            if (!isReady) {
                throw new Error('OKX Wallet not ready');
            }

            if (!window.okxwallet || !window.okxwallet.solana) {
                throw new Error('OKX Solana Wallet not found');
            }

            try {
                // 断开现有连接
                if (window.okxwallet.solana.isConnected) {
                    await window.okxwallet.solana.disconnect();
                }

                // 设置连接源信息
                if (window.okxwallet.setProvider) {
                    window.okxwallet.setProvider({
                        name: 'GMGN & DexScreener Analyzer',
                        logo: 'https://gmgn.ai/favicon.ico',
                        url: 'https://gmgn.ai'
                    });
                }

                // 请求连接 Solana 账户
                const resp = await window.okxwallet.solana.connect();
                console.log('OKX Solana connection response:', resp);

                if (!resp || !resp.publicKey) {
                    throw new Error('Failed to get Solana public key');
                }

                // 获取当前网络信息
                const network = await window.okxwallet.solana.connection?.rpcEndpoint || 'unknown';

                return {
                    success: true,
                    publicKey: resp.publicKey.toString(),
                    isConnected: true,
                    network: network,
                    chainType: 'solana',
                    walletType: walletType
                };
            } catch (error) {
                console.error('OKX Solana connection error:', error);
                if (error.code === 4001) {
                    throw new Error('用户拒绝了连接请求');
                }
                throw error;
            }
        } else if (walletType === 'phantom') {
            if (!window.solana || !window.solana.isPhantom) {
                throw new Error('Phantom wallet not found');
            }

            try {
                // 断开现有连接
                if (window.solana.isConnected) {
                    await window.solana.disconnect();
                }

                // 强制显示账户选择弹窗
                const resp = await window.solana.connect({ onlyIfTrusted: false });
                console.log('Phantom connection response:', resp);

                if (!resp || !resp.publicKey) {
                    throw new Error('Failed to get public key');
                }

                return {
                    success: true,
                    publicKey: resp.publicKey.toString(),
                    wallet: 'phantom',
                    walletType: walletType
                };
            } catch (error) {
                console.error('Phantom connection error:', error);
                throw error;
            }
        }
    } catch (error) {
        console.error('Wallet connection error:', error);
        return {
            success: false,
            error: error.message,
            code: error.code
        };
    }
}

// 监听来自content script的消息
window.addEventListener('message', async (event) => {
    // 确保消息来自我们的扩展
    if (event.data.source !== 'GMGN_EXTENSION') return;

    console.log('Received message in inject script:', event.data);

    if (event.data.type === 'DETECT_WALLET') {
        const result = detectWallet(event.data.wallet);
        window.postMessage({
            source: 'GMGN_EXTENSION',
            type: 'WALLET_DETECTED',
            wallet: event.data.wallet,
            exists: result
        }, '*');
    }

    if (event.data.type === 'CONNECT_WALLET') {
        try {
            const result = await connectWallet(event.data.wallet);
            window.postMessage({
                source: 'GMGN_EXTENSION',
                type: 'WALLET_CONNECTED',
                wallet: event.data.wallet,
                ...result
            }, '*');
        } catch (error) {
            window.postMessage({
                source: 'GMGN_EXTENSION',
                type: 'WALLET_CONNECTED',
                success: false,
                error: error.message
            }, '*');
        }
    } else if (event.data.type === 'DISCONNECT_WALLET') {
        try {
            await disconnectWallet(event.data.wallet);
            window.postMessage({
                source: 'GMGN_EXTENSION',
                type: 'WALLET_DISCONNECTED',
                success: true
            }, '*');
        } catch (error) {
            window.postMessage({
                source: 'GMGN_EXTENSION',
                type: 'WALLET_DISCONNECTED',
                success: false,
                error: error.message
            }, '*');
        }
    }
});

// 断开钱包连接
async function disconnectWallet(walletType) {
    try {
        if (walletType === 'phantom') {
            if (!window.solana || !window.solana.isPhantom) {
                throw new Error('Phantom wallet not found');
            }
            await window.solana.disconnect();
        } else if (walletType === 'okx') {
            if (!window.okxwallet) {
                throw new Error('OKX wallet not found');
            }
            await window.okxwallet.solana.disconnect();
        }
    } catch (error) {
        console.error('Disconnect error:', error);
        throw error;
    }
}