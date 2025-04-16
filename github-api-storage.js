/**
 * GitHub API 存储模块
 * 用于将API使用统计数据保存到GitHub仓库
 */

// 配置参数
const config = {
  // GitHub存储设置
  owner: 'qinchanghe123', // 替换为您的GitHub用户名
  repo: 'map',      // 替换为您的GitHub仓库名
  path: 'api_usage.json',        // 文件路径
  branch: 'main',                // 分支名称
  
  // GitHub令牌 - 直接设置在代码中，适用于私有仓库
  token: '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', // 替换为您的实际GitHub令牌
  
  // 缓存设置
  cacheTTL: 3600 * 1000,         // 缓存有效期（毫秒）
};

// 内存缓存
let memoryCache = {
  data: null,
  timestamp: 0,
  sha: null,
};

/**
 * 获取API使用统计数据
 * @returns {Promise<Object>} 包含API使用数据的Promise
 */
async function getApiUsageData() {
  try {
    // 检查内存缓存
    const now = Date.now();
    if (memoryCache.data && (now - memoryCache.timestamp < config.cacheTTL)) {
      console.log('使用内存缓存的API使用量数据');
      return memoryCache.data;
    }
    
    const { owner, repo, path, branch, token } = config;
    
    // 构建API URL
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    
    // 发送请求获取文件
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      }
    });
    
    if (response.status === 404) {
      // 文件不存在，返回初始数据
      console.log('GitHub中不存在API使用数据文件，将创建新文件');
      const initialData = {
        totalRequests: 0,
        dailyData: {},
        keyData: {}
      };
      
      // 更新内存缓存
      memoryCache.data = initialData;
      memoryCache.timestamp = now;
      memoryCache.sha = null;
      
      return initialData;
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API错误 (${response.status}): ${errorText}`);
    }
    
    const fileData = await response.json();
    const content = atob(fileData.content); // 解码Base64内容
    const usageData = JSON.parse(content);
    
    // 更新内存缓存
    memoryCache.data = usageData;
    memoryCache.timestamp = now;
    memoryCache.sha = fileData.sha;
    
    console.log('成功从GitHub获取API使用量数据');
    return usageData;
  } catch (error) {
    console.error('获取API使用量数据失败:', error);
    
    // 返回空数据结构
    return {
      totalRequests: 0,
      dailyData: {},
      keyData: {}
    };
  }
}

/**
 * 保存API使用统计数据到GitHub
 * @param {Object} usageData API使用数据对象
 * @returns {Promise<boolean>} 是否成功保存
 */
async function saveApiUsageData(usageData) {
  try {
    const { owner, repo, path, branch, token } = config;
    
    // 构建API URL
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    
    // 将数据转换为JSON字符串
    const content = JSON.stringify(usageData, null, 2);
    const encodedContent = btoa(unescape(encodeURIComponent(content))); // 编码为Base64
    
    // 准备请求体
    const requestBody = {
      message: `更新API使用统计数据 - ${new Date().toISOString()}`,
      content: encodedContent,
      branch,
    };
    
    // 如果有SHA，则添加到请求中（用于更新现有文件）
    if (memoryCache.sha) {
      requestBody.sha = memoryCache.sha;
    }
    
    // 发送请求保存文件
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API错误 (${response.status}): ${errorText}`);
    }
    
    const responseData = await response.json();
    
    // 更新SHA
    memoryCache.sha = responseData.content.sha;
    
    console.log('成功保存API使用量数据到GitHub');
    return true;
  } catch (error) {
    console.error('保存API使用量数据失败:', error);
    return false;
  }
}

/**
 * 记录API请求
 * @param {string} apiKey API密钥
 * @param {Date} timestamp 时间戳（可选，默认为当前时间）
 * @returns {Promise<boolean>} 是否成功记录
 */
async function recordApiRequest(apiKey, timestamp = new Date()) {
  try {
    if (!apiKey) {
      console.error('记录API请求失败: 缺少API密钥');
      return false;
    }
    
    // 转换为北京时间
    const beijingTimestamp = new Date(timestamp);
    beijingTimestamp.setTime(beijingTimestamp.getTime() + 8 * 60 * 60 * 1000);
    const dateStr = beijingTimestamp.toISOString().substring(0, 10);
    
    // 获取现有数据
    let apiUsageData = await getApiUsageData();
    
    // 增加总请求计数
    apiUsageData.totalRequests = (apiUsageData.totalRequests || 0) + 1;
    
    // 更新每日数据
    if (!apiUsageData.dailyData) {
      apiUsageData.dailyData = {};
    }
    apiUsageData.dailyData[dateStr] = (apiUsageData.dailyData[dateStr] || 0) + 1;
    
    // 更新API密钥数据
    if (!apiUsageData.keyData) {
      apiUsageData.keyData = {};
    }
    if (!apiUsageData.keyData[apiKey]) {
      apiUsageData.keyData[apiKey] = {
        count: 0,
        lastUsed: null,
      };
    }
    apiUsageData.keyData[apiKey].count++;
    apiUsageData.keyData[apiKey].lastUsed = beijingTimestamp.toISOString();
    
    // 更新内存缓存
    memoryCache.data = apiUsageData;
    memoryCache.timestamp = Date.now();
    
    // 保存到GitHub
    return await saveApiUsageData(apiUsageData);
  } catch (e) {
    console.error('记录API请求失败:', e);
    return false;
  }
}

// 导出模块
window.GitHubApiStorage = {
  getApiUsageData,
  recordApiRequest
}; 
