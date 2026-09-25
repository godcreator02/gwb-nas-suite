/**
 * 组件名单，站这一侧的正本。mdx.tsx 用它的类型要求 React 表一个不多一个不少；
 * scripts/verify-roster.mjs 拿它跟 docfirst.config.mjs 里的机读规则表两头对。
 *
 * 缺哪一边都会失败：机读规则表没有 → 生成机读版时报「名册外组件」；React 表没有 → 站渲染报 Expected component。
 * Files / Folder / File 是 fumadocs 自带的文件树，目录树引用生成的就是它们，机读规则在格式包的默认表里。
 * 这个文件只有能被擦除的类型，Node 可以直接加载。
 */
export const componentNames = ['Note', 'Files', 'Folder', 'File', 'DeepseekSeams'] as const
export type ComponentName = (typeof componentNames)[number]
