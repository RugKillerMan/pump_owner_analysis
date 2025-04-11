// 当插件安装或更新时自动打开侧边栏
chrome.runtime.onInstalled.addListener(async () => {
  // 确保侧边栏功能启用
  await chrome.sidePanel.setOptions({
    enabled: true
  });

  // 设置侧边栏在点击插件图标时打开
  await chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
});

// 当用户点击插件图标时切换侧边栏
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // 尝试打开侧边栏
    await chrome.sidePanel.open({tabId: tab.id});
  } catch (error) {
    console.error('打开侧边栏失败:', error);
  }
}); 