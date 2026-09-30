/**
 * mdx 里能用的 React 组件表。表的类型由 registry.ts 的名单决定：少一个、多一个都编译不过；
 * 跟 docfirst.config.mjs 的机读规则表是否一致，由 scripts/verify-roster.mjs 核对。
 * 在 fumadocs 的默认表之上加本站组件，再把 pre 换成 @godcreator/docfirst-workflow/fumadocs/pre 里会画引用状态点的 DocfirstPre。
 */
import defaultMdxComponents from 'fumadocs-ui/mdx'
import { File, Files, Folder } from 'fumadocs-ui/components/files'
import type { MDXComponents } from 'mdx/types'
import type { ReactNode } from 'react'
import { DocfirstPre } from '@godcreator/docfirst-workflow/fumadocs/pre'
import { DeepseekSeams } from './deepseek-seams'
import type { ComponentName } from './registry'

export function Note({ children }: { children?: ReactNode }) {
  return <div className="note">{children}</div>
}

const table: Record<ComponentName, MDXComponents[string]> = {
  Note,
  Files,
  Folder,
  File,
  DeepseekSeams,
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...components,
    ...table,
    pre: DocfirstPre,
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
