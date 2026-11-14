/* 测试替身：把 cloudflare:sockets 换成空壳。
   Node 不认识 cloudflare: 这个协议，而 mail.js 必须是静态 import（线上动态 import
   不可靠），所以只能在打包这一侧替换。MAIL_MODE=console 时根本不会调到它，
   真被调到了就报错——那说明测试意外走了发信分支。 */
export function connect() {
  throw new Error('测试环境不提供真实 TCP 连接（MAIL_MODE 应为 console）');
}
