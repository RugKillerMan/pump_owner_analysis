// 会员状态检查和刷新功能
document.addEventListener('DOMContentLoaded', () => {
    const membershipStatus = document.getElementById('membershipStatus');
    const refreshButton = document.getElementById('refreshMembership');
    const purchaseLink = document.getElementById('purchaseLink');

    // 钱包登录
    async function walletLogin(walletAddress, walletType) {
        try {
            console.log("Sending login request to backend...");
            const response = await fetch('https://pumptools.me/api/member/wallet-login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    walletAddress: walletAddress,
                    walletType: walletType
                })
            });



            console.log("Backend response status:", response.status);

            const data = await response.json();
            console.log("Backend response data:", data);

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to login with wallet');
            }

            if (data.token) {
                // 保存 token 到 chrome.storage
                await chrome.storage.local.set({ token: data.token });
                console.log(' ---> Received token:', data.token);

                // 保存会员过期时间
                if (data.data && data.data.member_expire_time) {
                    console.log('Received member expiry:', data.data.member_expire_time);
                    sessionStorage.setItem('membershipExpiry', data.data.member_expire_time);
                }

                // 登录成功后立即检查会员状态
                await checkMembershipStatus();
                return true;
            } else {
                throw new Error('No token received from server');
            }
        } catch (error) {
            console.error('Backend login error:', error);
            throw new Error(`Login failed: ${error.message}`);
        }
    }

    // 检查会员状态
    async function checkMembershipStatus() {
        try {
            console.log('Starting membership status check...');

            // 获取钱包地址和token
            const storage = await chrome.storage.local.get(['walletAddress', 'token']);
            console.log('Storage data:', storage);

            const { walletAddress, token } = storage;
            console.log('Wallet address:', walletAddress);
            console.log('Token:', token);

            if (!walletAddress || !token) {
                console.log('Missing wallet address or token');
                updateStatusDisplay('请先连接钱包', 'non-member');
                purchaseLink.style.display = 'flex';
                return;
            }

            // 开始加载动画
            refreshButton.classList.add('loading');
            console.log('Checking membership for address:', walletAddress);

            // 调用 API 检查会员状态
            const response = await fetch(`https://pumptools.me/api/rights/user/${walletAddress}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('API response status:', response.status);
            const responseData = await response.json();
            console.log('API response data:', responseData);

            if (responseData.data && responseData.data.data && responseData.data.data.length > 0) {
                console.log('Found rights data:', responseData.data.data);
                // 找到最晚的过期时间
                let latestExpireTime = null;
                responseData.data.data.forEach(right => {
                    if (right.expire_time) {
                        const expireDate = new Date(right.expire_time);
                        console.log('Found expiry date:', expireDate);
                        if (!latestExpireTime || expireDate > latestExpireTime) {
                            latestExpireTime = expireDate;
                        }
                    }
                });

                if (latestExpireTime) {
                    console.log('Latest expiry time:', latestExpireTime);
                    // 保存到 sessionStorage
                    sessionStorage.setItem('membershipExpiryTime', latestExpireTime.toISOString());

                    // 显示最晚的过期时间
                    const formattedDate = latestExpireTime.toLocaleDateString('zh-CN');
                    if (latestExpireTime > new Date()) {
                        updateStatusDisplay(`有效期至 ${formattedDate}`, 'member');
                        purchaseLink.style.display = 'none';
                    } else {
                        updateStatusDisplay('会员已过期', 'non-member');
                        purchaseLink.style.display = 'flex';
                    }
                } else {
                    console.log('No valid expiry time found');
                    updateStatusDisplay('非会员', 'non-member');
                    purchaseLink.style.display = 'flex';
                }
            } else {
                console.log('No rights data found');
                // 没有权限记录
                updateStatusDisplay('非会员', 'non-member');
                purchaseLink.style.display = 'flex';
            }
        } catch (error) {
            console.error('Failed to check membership:', error);
            updateStatusDisplay('检查失败', 'non-member');
        } finally {
            refreshButton.classList.remove('loading');
        }
    }

    // 更新状态显示
    function updateStatusDisplay(text, className) {
        membershipStatus.textContent = text;
        membershipStatus.className = 'status-value ' + (className || '');
    }

    // 监听刷新按钮点击
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            if (!refreshButton.classList.contains('loading')) {
                checkMembershipStatus();
            }
        });
    }

    // 初始检查会员状态
    checkMembershipStatus();

    // 监听钱包连接状态变化
    chrome.storage.onChanged.addListener((changes, namespace) => {
        console.log('Storage changes:', changes);
        console.log('Storage namespace:', namespace);

        if (changes.walletAddress) {
            console.log('Wallet address changed:', changes.walletAddress);
            const newWalletAddress = changes.walletAddress.newValue;

            // 从 chrome.storage 获取 walletType
            chrome.storage.local.get(['walletType'], async (result) => {
                const walletType = result.walletType;
                console.log('Current wallet type:', walletType);

                if (newWalletAddress && walletType) {
                    console.log('Initiating wallet login with:', { newWalletAddress, walletType });
                    walletLogin(newWalletAddress, walletType);
                }
            });
        }
    });

    // 监听来自内容脚本的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'CHECK_MEMBERSHIP') {
            checkMembershipStatus()
                .then(() => sendResponse({ success: true }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true; // 保持消息通道开放
        }
    });

    // 导出 walletLogin 函数供其他模块使用
    window.walletLogin = walletLogin;
});