class BaseAnalyzer {
  static log(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${this.name}: ${message}`, data || '');
  }
}

window.BaseAnalyzer = BaseAnalyzer; 