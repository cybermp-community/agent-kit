import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Project,
  InterfaceDeclaration,
  ClassDeclaration,
  TypeAliasDeclaration,
  EnumDeclaration,
  Node,
} from 'ts-morph';
import { parse as parseYaml } from 'yaml';
import { eventReferenceWithCatalog } from './event-reference.js';
import { buildNativeIndex } from './build-native-index.js';
import { extractDocMetadata } from './sync-docs.js';
import type {
  EventParameter,
  EventRecord,
  PropertyRecord,
  MethodParameter,
  MethodRecord,
  EnumMemberRecord,
  TypeRecord,
  GuideExampleContext,
  GuideRecord,
  BuildIndexResult,
} from '../src/types/index.js';

export * from '../src/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const EVENT_MAP_INTERFACES = new Set([
  'MpEventsMap',
  'MpCefEventsMap',
  'PlayersEvents',
  'VehiclesEvents',
  'WorldEvents',
  'PickupsEvents',
  'PedEvents',
  'EntitiesEvents',
  'ResourcesEvents',
]);

export function cleanType(typeStr: string): string {
  if (!typeStr) return '';
  return typeStr
    .replace(/import\([^)]+\)\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getJsDocDescription(node: any): string {
  if (!node || !node.getJsDocs) return '';
  const jsDocs = node.getJsDocs();
  if (!jsDocs || jsDocs.length === 0) return '';
  return jsDocs.map((doc: any) => doc.getDescription()).join('\n').trim();
}

export function getJsDocCategory(node: any): string | undefined {
  if (!node || !node.getJsDocs) return undefined;
  for (const doc of node.getJsDocs()) {
    for (const tag of doc.getTags()) {
      if (tag.getTagName() === 'category') {
        const comment = tag.getCommentText?.() || tag.getComment?.() || '';
        if (comment) return String(comment).trim();
      }
    }
  }
  return undefined;
}

export function getParamJsDoc(node: any, paramName: string): string | undefined {
  if (!node || !node.getJsDocs) return undefined;
  for (const doc of node.getJsDocs()) {
    for (const tag of doc.getTags()) {
      if (tag.getTagName() === 'param') {
        const text = tag.getText();
        const match = text.match(/@param\s+(\w+)\s+(?:-\s+)?(.*)/);
        if (match && match[1] === paramName) {
          return match[2].trim();
        }
      }
    }
  }
  return undefined;
}

export function extractPlainText(markdown: string): string {
  const prose = markdown
    .replace(/^---[\s\S]*?---\r?\n?/, '')
    .replace(/^[ \t]*(?:```|~~~)[^\n]*\r?\n([\s\S]*?)\r?\n[ \t]*(?:```|~~~)[ \t]*$/gm, '');
  return prose.split(/(`[^`\n]+`)/).map((part, index) => {
    if (index % 2) return part.slice(1, -1);
    return part
      .replace(/<!--[^]*?-->/g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/^#+\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*~>|]/g, '');
  }).join('').replace(/\s+/g, ' ').trim();
}

export function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[^\p{L}\p{M}\p{N}_\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

export function extractCodeSnippets(markdown: string): string[] {
  const snippets: string[] = [];
  const regex = /^[ \t]*(?:```|~~~)([^\s\n]*)[^\n]*\r?\n([\s\S]*?)\r?\n[ \t]*(?:```|~~~)[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const lang = (match[1] || '').toLowerCase().trim();
    if (lang === 'mermaid') continue;
    const code = match[2].trim();
    if (code) {
      snippets.push(code);
    }
  }
  return snippets;
}

export function createAstProject(projectRoot: string = PROJECT_ROOT): Project {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
  });

  const patterns = [
    path.join(projectRoot, 'node_modules/@cybermp/server-types/src/*.ts'),
    path.join(projectRoot, 'node_modules/@cybermp/client-types/precomputed/*.d.ts'),
    path.join(projectRoot, 'node_modules/@cybermp/client-types/precomputed/*.ts'),
    path.join(projectRoot, 'node_modules/@cybermp/browser-types/index.d.ts'),
  ];

  for (const pattern of patterns) {
    project.addSourceFilesAtPaths(pattern);
  }

  return project;
}

export function parseEventsFromAst(options?: { project?: Project; projectRoot?: string }): EventRecord[] {
  const projectRoot = options?.projectRoot || PROJECT_ROOT;
  const project = options?.project || createAstProject(projectRoot);
  const events: EventRecord[] = [];
  const seen = new Set<string>();

  // 1. Server events
  const serverEventsFile = project.getSourceFiles().find((sf) =>
    sf.getFilePath().includes('@cybermp/server-types/src/events.ts')
  );

  if (serverEventsFile) {
    const mpEventsMap = serverEventsFile.getInterface('MpEventsMap');
    const eventInterfaces: InterfaceDeclaration[] = [];
    if (mpEventsMap) {
      eventInterfaces.push(mpEventsMap);
      for (const base of mpEventsMap.getBaseDeclarations()) {
        if (base && Node.isInterfaceDeclaration(base)) {
          eventInterfaces.push(base);
        }
      }
    }

    for (const iface of eventInterfaces) {
      const ifaceName = iface.getName();
      let defaultCategory = 'Events';
      if (ifaceName.endsWith('Events')) {
        defaultCategory = ifaceName.replace(/Events$/, '');
      }

      for (const method of iface.getMethods()) {
        const name = method.getName();
        const key = `server:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const category = getJsDocCategory(method) || getJsDocCategory(iface) || defaultCategory;
        const description = getJsDocDescription(method);

        const parameters: EventParameter[] = method.getParameters().map((p) => {
          const typeNode = p.getTypeNode();
          const rawType = typeNode ? typeNode.getText() : p.getType().getText();
          const isRest = p.isRestParameter ? p.isRestParameter() : false;
          return {
            name: p.getName(),
            type: cleanType(rawType),
            optional: p.isOptional() && !isRest,
            ...(isRest ? { isRest: true } : {}),
            description: getParamJsDoc(method, p.getName()),
          };
        });

        const retTypeNode = method.getReturnTypeNode();
        const rawRetType = retTypeNode ? retTypeNode.getText() : method.getReturnType().getText();
        const returnType = cleanType(rawRetType) || 'void';

        const paramsStr = parameters
          .map((p) => `${p.isRest ? '...' : ''}${p.name}${p.optional ? '?' : ''}: ${p.type}`)
          .join(', ');
        const signature = `${name}(${paramsStr}): ${returnType}`;

        events.push({
          name,
          env: 'server',
          category,
          ...(description ? { description } : {}),
          parameters,
          returnType,
          signature,
          source: ifaceName,
        });
      }
    }
  }

  // 2. Client events
  const clientEventsFile = project.getSourceFiles().find((sf) =>
    sf.getFilePath().includes('@cybermp/client-types/precomputed/events.d.ts')
  );

  if (clientEventsFile) {
    // a) MpEventsMap
    const clientEventsMap = clientEventsFile.getInterface('MpEventsMap');
    if (clientEventsMap) {
      for (const method of clientEventsMap.getMethods()) {
        const name = method.getName();
        const key = `client:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const category = name.includes('Stream') ? 'Streaming' : 'Lifecycle';
        const description = getJsDocDescription(method);

        const parameters: EventParameter[] = method.getParameters().map((p) => {
          const typeNode = p.getTypeNode();
          const rawType = typeNode ? typeNode.getText() : p.getType().getText();
          const isRest = p.isRestParameter ? p.isRestParameter() : false;
          return {
            name: p.getName(),
            type: cleanType(rawType),
            optional: p.isOptional() && !isRest,
            ...(isRest ? { isRest: true } : {}),
            description: getParamJsDoc(method, p.getName()),
          };
        });

        const retTypeNode = method.getReturnTypeNode();
        const rawRetType = retTypeNode ? retTypeNode.getText() : method.getReturnType().getText();
        const returnType = cleanType(rawRetType) || 'void';

        const paramsStr = parameters
          .map((p) => `${p.isRest ? '...' : ''}${p.name}${p.optional ? '?' : ''}: ${p.type}`)
          .join(', ');
        const signature = `${name}(${paramsStr}): ${returnType}`;

        events.push({
          name,
          env: 'client',
          category,
          ...(description ? { description } : {}),
          parameters,
          returnType,
          signature,
          source: 'MpEventsMap',
        });
      }
    }

    // b) MpCefEventsMap
    const cefEventsMap = clientEventsFile.getInterface('MpCefEventsMap');
    if (cefEventsMap) {
      for (const method of cefEventsMap.getMethods()) {
        const name = method.getName();
        const key = `client:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const description = getJsDocDescription(method);
        const parameters: EventParameter[] = method.getParameters().map((p) => {
          const typeNode = p.getTypeNode();
          const rawType = typeNode ? typeNode.getText() : p.getType().getText();
          const isRest = p.isRestParameter ? p.isRestParameter() : false;
          return {
            name: p.getName(),
            type: cleanType(rawType),
            optional: p.isOptional() && !isRest,
            ...(isRest ? { isRest: true } : {}),
            description: getParamJsDoc(method, p.getName()),
          };
        });

        const retTypeNode = method.getReturnTypeNode();
        const rawRetType = retTypeNode ? retTypeNode.getText() : method.getReturnType().getText();
        const returnType = cleanType(rawRetType) || 'void';

        const paramsStr = parameters
          .map((p) => `${p.isRest ? '...' : ''}${p.name}${p.optional ? '?' : ''}: ${p.type}`)
          .join(', ');
        const signature = `${name}(${paramsStr}): ${returnType}`;

        events.push({
          name,
          env: 'client',
          category: 'CEF',
          ...(description ? { description } : {}),
          parameters,
          returnType,
          signature,
          source: 'MpCefEventsMap',
        });
      }
    }
  }

  // 3. Browser events
  const browserFile = project.getSourceFiles().find((sf) =>
    sf.getFilePath().includes('@cybermp/browser-types/index.d.ts')
  );

  if (browserFile) {
    const browserEvents = browserFile.getInterface('MpEvents');
    if (browserEvents) {
      for (const method of browserEvents.getMethods()) {
        const name = method.getName();
        const key = `browser:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const description = getJsDocDescription(method);
        const parameters: EventParameter[] = method.getParameters().map((p) => {
          const typeNode = p.getTypeNode();
          const rawType = typeNode ? typeNode.getText() : p.getType().getText();
          const isRest = p.isRestParameter ? p.isRestParameter() : false;
          return {
            name: p.getName(),
            type: cleanType(rawType),
            optional: p.isOptional() && !isRest,
            ...(isRest ? { isRest: true } : {}),
            description: getParamJsDoc(method, p.getName()),
          };
        });

        const retTypeNode = method.getReturnTypeNode();
        const rawRetType = retTypeNode ? retTypeNode.getText() : method.getReturnType().getText();
        const returnType = cleanType(rawRetType) || 'void';

        const paramsStr = parameters
          .map((p) => `${p.isRest ? '...' : ''}${p.name}${p.optional ? '?' : ''}: ${p.type}`)
          .join(', ');
        const signature = `${name}(${paramsStr}): ${returnType}`;

        events.push({
          name,
          env: 'browser',
          category: 'Browser',
          ...(description ? { description } : {}),
          parameters,
          returnType,
          signature,
          source: 'MpEvents',
        });
      }
    }
  }

  return events;
}

export function parseTypesFromAst(options?: { project?: Project; projectRoot?: string }): TypeRecord[] {
  const projectRoot = options?.projectRoot || PROJECT_ROOT;
  const project = options?.project || createAstProject(projectRoot);
  const types: TypeRecord[] = [];
  const seen = new Set<string>();

  function extractTypeMembers(decl: InterfaceDeclaration | ClassDeclaration) {
    const methods: MethodRecord[] = [];
    const properties: PropertyRecord[] = [];
    const methodNames = new Set<string>();
    const propNames = new Set<string>();

    const typeObj = decl.getType();
    const typeSymbols = typeObj.getProperties();

    for (const sym of typeSymbols) {
      const symName = sym.getName();
      const symDecl = sym.getValueDeclaration() || (sym.getDeclarations() && sym.getDeclarations()[0]);
      if (!symDecl) continue;

      if (Node.isMethodSignature(symDecl) || Node.isMethodDeclaration(symDecl)) {
        if (!methodNames.has(symName)) {
          methodNames.add(symName);
          const parameters: MethodParameter[] = symDecl.getParameters().map((p) => {
            const isRest = p.isRestParameter ? p.isRestParameter() : false;
            const typeNode = p.getTypeNode();
            const rawType = typeNode ? typeNode.getText() : p.getType().getText();
            return {
              name: p.getName(),
              type: cleanType(rawType),
              optional: p.isOptional() && !isRest,
              ...(isRest ? { isRest: true } : {}),
              description: getParamJsDoc(symDecl, p.getName()),
            };
          });

          const retNode = symDecl.getReturnTypeNode();
          const rawRet = retNode ? retNode.getText() : symDecl.getReturnType().getText();
          const returnType = cleanType(rawRet) || 'void';

          const paramsStr = parameters
            .map((p) => `${p.isRest ? '...' : ''}${p.name}${p.optional ? '?' : ''}: ${p.type}`)
            .join(', ');
          const signature = `${symName}(${paramsStr}): ${returnType}`;
          const description = getJsDocDescription(symDecl);

          methods.push({
            name: symName,
            parameters,
            returnType,
            signature,
            ...(description ? { description } : {}),
          });
        }
      } else if (Node.isPropertySignature(symDecl) || Node.isPropertyDeclaration(symDecl)) {
        if (!propNames.has(symName)) {
          propNames.add(symName);
          const typeNode = symDecl.getTypeNode();
          const rawType = typeNode ? typeNode.getText() : symDecl.getType().getText();
          const optional = symDecl.hasQuestionToken ? symDecl.hasQuestionToken() : false;
          const readonly = symDecl.isReadonly ? symDecl.isReadonly() : false;
          const description = getJsDocDescription(symDecl);

          properties.push({
            name: symName,
            type: cleanType(rawType),
            ...(optional ? { optional: true } : {}),
            ...(readonly ? { readonly: true } : {}),
            ...(description ? { description } : {}),
          });
        }
      }
    }

    return { methods, properties };
  }

  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    const baseName = sf.getBaseName();
    if (baseName === 'index.ts' || baseName === 'index.d.ts') continue;

    let env: 'server' | 'client' | 'browser' | 'shared' = 'server';
    if (filePath.includes('@cybermp/browser-types')) {
      env = 'browser';
    } else if (filePath.includes('@cybermp/client-types')) {
      env = 'client';
    } else if (filePath.includes('@cybermp/server-types')) {
      env = baseName === 'shared.ts' ? 'shared' : 'server';
    }

    // 1. Interfaces
    for (const iface of sf.getInterfaces()) {
      const name = iface.getName();
      // Skip event maps as they are indexed separately in events.json
      if (EVENT_MAP_INTERFACES.has(name)) continue;

      const key = `${env}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const description = getJsDocDescription(iface);
      const category = getJsDocCategory(iface) || baseName.replace(/\.(d\.ts|ts)$/, '');
      const typeParams = iface.getTypeParameters().map((tp) => tp.getText());
      const extendsList = iface.getExtends().map((e) => cleanType(e.getText()));
      const { methods, properties } = extractTypeMembers(iface);

      types.push({
        name,
        kind: 'interface',
        env,
        category,
        ...(description ? { description } : {}),
        properties,
        methods,
        ...(typeParams.length > 0 ? { typeParameters: typeParams } : {}),
        ...(extendsList.length > 0 ? { extends: extendsList } : {}),
      });
    }

    // 2. Type Aliases
    for (const alias of sf.getTypeAliases()) {
      const name = alias.getName();
      const key = `${env}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const description = getJsDocDescription(alias);
      const category = getJsDocCategory(alias) || baseName.replace(/\.(d\.ts|ts)$/, '');
      const typeParams = alias.getTypeParameters().map((tp) => tp.getText());
      const typeNode = alias.getTypeNode();
      const rawDefinition = cleanType(typeNode ? typeNode.getText() : alias.getType().getText());

      const properties: PropertyRecord[] = [];
      const methods: MethodRecord[] = [];
      const propNames = new Set<string>();

      const aliasType = alias.getType();
      const isTupleOrArray =
        aliasType.isTuple() ||
        aliasType.isArray() ||
        (typeNode && (Node.isTupleTypeNode(typeNode) || Node.isArrayTypeNode(typeNode)));

      if (
        !isTupleOrArray &&
        aliasType &&
        (aliasType.isObject() || Node.isTypeLiteral(typeNode) || Node.isIntersectionTypeNode(typeNode))
      ) {
        for (const sym of aliasType.getProperties()) {
          const symName = sym.getName();
          if (propNames.has(symName)) continue;
          propNames.add(symName);

          const symDecl = sym.getValueDeclaration() || (sym.getDeclarations() && sym.getDeclarations()[0]);
          if (!symDecl) continue;

          if (Node.isMethodSignature(symDecl)) {
            const parameters: MethodParameter[] = symDecl.getParameters().map((p) => ({
              name: p.getName(),
              type: cleanType(p.getTypeNode()?.getText() || p.getType().getText()),
              optional: p.isOptional(),
            }));
            const returnType =
              cleanType(symDecl.getReturnTypeNode()?.getText() || symDecl.getReturnType().getText()) || 'void';
            const signature = `${symName}(${parameters.map((p) => `${p.name}: ${p.type}`).join(', ')}): ${returnType}`;
            methods.push({
              name: symName,
              parameters,
              returnType,
              signature,
              description: getJsDocDescription(symDecl),
            });
          } else if (Node.isPropertySignature(symDecl) || Node.isPropertyDeclaration(symDecl)) {
            const symTypeNode = symDecl.getTypeNode();
            const rawType = symTypeNode ? symTypeNode.getText() : sym.getTypeAtLocation(alias).getText();
            const optional = symDecl.hasQuestionToken();
            const readonly = symDecl.isReadonly();
            properties.push({
              name: symName,
              type: cleanType(rawType),
              ...(optional ? { optional: true } : {}),
              ...(readonly ? { readonly: true } : {}),
              description: getJsDocDescription(symDecl),
            });
          } else {
            const rawType = sym.getTypeAtLocation(alias).getText();
            properties.push({
              name: symName,
              type: cleanType(rawType),
              description: getJsDocDescription(symDecl),
            });
          }
        }
      }

      types.push({
        name,
        kind: 'type',
        env,
        category,
        ...(description ? { description } : {}),
        properties,
        methods,
        ...(typeParams.length > 0 ? { typeParameters: typeParams } : {}),
        rawDefinition,
      });
    }

    // 3. Enums
    for (const enumDecl of sf.getEnums()) {
      const name = enumDecl.getName();
      const key = `${env}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const description = getJsDocDescription(enumDecl);
      const category = getJsDocCategory(enumDecl) || baseName.replace(/\.(d\.ts|ts)$/, '');
      const enumMembers: EnumMemberRecord[] = enumDecl.getMembers().map((m) => ({
        name: m.getName(),
        value: m.getValue(),
        description: getJsDocDescription(m),
      }));

      types.push({
        name,
        kind: 'enum',
        env,
        category,
        ...(description ? { description } : {}),
        properties: [],
        methods: [],
        enumMembers,
      });
    }

    // 4. Classes
    for (const cls of sf.getClasses()) {
      const name = cls.getName();
      if (!name) continue;
      const key = `${env}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const description = getJsDocDescription(cls);
      const category = getJsDocCategory(cls) || baseName.replace(/\.(d\.ts|ts)$/, '');
      const typeParams = cls.getTypeParameters().map((tp) => tp.getText());
      const extendsList: string[] = [];
      const baseClass = cls.getBaseClass();
      if (baseClass) {
        extendsList.push(cleanType(baseClass.getName() || ''));
      }
      const { methods, properties } = extractTypeMembers(cls);

      types.push({
        name,
        kind: 'class',
        env,
        category,
        ...(description ? { description } : {}),
        properties,
        methods,
        ...(typeParams.length > 0 ? { typeParameters: typeParams } : {}),
        ...(extendsList.length > 0 ? { extends: extendsList } : {}),
      });
    }
  }

  // Also include browser types from index.d.ts
  const browserFile = project.getSourceFiles().find((sf) =>
    sf.getFilePath().includes('@cybermp/browser-types/index.d.ts')
  );
  if (browserFile) {
    for (const iface of browserFile.getInterfaces()) {
      const name = iface.getName();
      const key = `browser:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const description = getJsDocDescription(iface);
      const { methods, properties } = extractTypeMembers(iface);
      types.push({
        name,
        kind: 'interface',
        env: 'browser',
        category: 'Browser',
        ...(description ? { description } : {}),
        properties,
        methods,
      });
    }
  }

  return types;
}

export function parseMarkdownSections(
  content: string,
  baseSlug: string,
  baseUrl: string,
  docTitle: string,
  docDescription: string,
): GuideRecord[] {
  const sections: Array<{ title?: string; lines: string[] }> = [{ lines: [] }];
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const metadata = (frontmatter ? parseYaml(frontmatter[1]) : {}) ?? {};
  let fence: string | undefined;

  for (const line of content.slice(frontmatter?.[0].length ?? 0).split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = undefined;
      }
      sections.at(-1)!.lines.push(line);
      continue;
    }
    if (marker) fence = marker[1];
    const heading = /^#{2,3}\s+(.+?)\s*#*\s*$/.exec(line)?.[1];
    if (heading) {
      sections.push({ title: heading.replace(/`([^`]+)`/g, '$1'), lines: [] });
    } else {
      sections.at(-1)!.lines.push(line);
    }
  }

  const anchors = new Set<string>();
  return sections.map(({ title: sectionTitle, lines }, index) => {
    const blocks: Array<{ language: string; code: string; context: GuideExampleContext }> = [];
    const sectionText = lines.join('\n');
    let previousFenceEnd = 0;
    const prose = sectionText.replace(
      /^[ \t]*([`~])\1{2,}([^\s`~]*)([^\n]*)\n([\s\S]*?)\n[ \t]*\1{3,}[ \t]*$/gm,
      (block: string, _marker: string, language: string, attributes: string, code: string, offset: number) => {
        if (language.toLowerCase() !== 'mermaid' && code.trim()) {
          const context: GuideExampleContext = {};
          const [, environment] = /(?:^|\s)env=(client|server|browser|tooling)(?=\s|$)/.exec(attributes) ?? [];
          if (environment === 'client' || environment === 'server' || environment === 'browser' || environment === 'tooling') {
            context.environment = environment;
          }
          const checked = /(?:^|\s)checked=(@cybermp\/(client|server|browser)-types@[^\s]+)(?=\s|$)/.exec(attributes);
          if (checked && checked[2] === environment) context.checkedAgainst = checked[1];
          const notes = sectionText.slice(previousFenceEnd, offset).trim()
            .split(/\n[ \t]*\n/).map(extractPlainText).filter((paragraph) => paragraph && !/^[-*_]{3,}$/.test(paragraph)).at(-1);
          if (notes) context.notes = notes;
          blocks.push({ language, code: code.trim(), context });
        }
        previousFenceEnd = offset + block.length;
        return '\n\n';
      },
    );
    const paragraphs = prose.split(/\n[ \t]*\n/).map(extractPlainText).filter(Boolean);
    const baseAnchor = sectionTitle ? toKebabCase(sectionTitle) || `section-${index}` : '';
    let anchor = baseAnchor;
    for (let suffix = 1; anchors.has(anchor); suffix++) anchor = `${baseAnchor}-${suffix}`;
    anchors.add(anchor);
    const suffix = sectionTitle ? `#${anchor}` : '';
    const priorityAliases = sectionTitle ? metadata.sectionPriorityAliases?.[anchor] : metadata.priorityAliases;

    return {
      title: docTitle,
      guideTitle: docTitle,
      ...(sectionTitle ? { sectionTitle } : {
        description: docDescription,
        ...(Array.isArray(metadata.aliases) ? { aliases: metadata.aliases } : {}),
      }),
      ...(Array.isArray(priorityAliases) ? { priorityAliases } : {}),
      slug: baseSlug + suffix,
      url: baseUrl + suffix,
      codeSnippets: blocks.map((block) => block.code),
      codeLanguages: blocks.map((block) => block.language),
      ...(blocks.length ? { exampleContexts: blocks.map((block) => block.context) } : {}),
      plainText: paragraphs.join(' '),
      paragraphs,
      ...(metadata.environment ? { environment: metadata.environment } : {}),
      ...(metadata.verificationStatus ? { verificationStatus: metadata.verificationStatus } : {}),
    };
  });
}

export function parseGuides(docsDir?: string, projectRoot: string = PROJECT_ROOT): GuideRecord[] {
  const targetDir = path.resolve(docsDir || path.join(projectRoot, 'tmp/docs'));
  const referencesDir = path.resolve(projectRoot, 'skills/cybermp-dev/references');

  const hasDocs = fs.existsSync(targetDir);
  const hasReferences = fs.existsSync(referencesDir);

  const upstreamPath = path.join(projectRoot, 'data/upstream-guides.json');
  const hasUpstream = docsDir === undefined && fs.existsSync(upstreamPath);
  if (!hasDocs && !hasReferences && !hasUpstream) {
    throw new Error(`Docs directory does not exist: ${targetDir}. Run sync:docs first.`);
  }

  function findDocFiles(dir: string, baseDir = dir): { fullPath: string; relPath: string }[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: { fullPath: string; relPath: string }[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findDocFiles(fullPath, baseDir));
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
        const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        files.push({ fullPath, relPath });
      }
    }
    return files;
  }

  const docFiles = hasDocs && (docsDir !== undefined || !hasUpstream) ? findDocFiles(targetDir) : [];
  const guides: GuideRecord[] = [];
  if (hasUpstream) {
    const upstream = JSON.parse(fs.readFileSync(upstreamPath, 'utf8'));
    for (const guide of upstream.guides) {
      guides.push({
        slug: guide.slug,
        title: guide.title,
        guideTitle: guide.title,
        url: guide.slug === 'introduction' ? 'https://docs.cyber.mp/' : `https://docs.cyber.mp/guides/${guide.slug}/`,
        plainText: guide.summary,
        paragraphs: [guide.summary],
        codeSnippets: [],
        sourceKind: 'cybermp-docs',
        sourceRevision: upstream.revision,
        sourceUrl: `${upstream.repository.replace(/\.git$/, '')}/blob/${upstream.revision}/${upstream.contentRoot}/${guide.slug}.mdx`,
        environment: guide.environment,
        verificationStatus: 'upstream-summary',
      });
    }
  }


  for (const doc of docFiles) {
    const content = fs.readFileSync(doc.fullPath, 'utf-8');
    const slug = doc.relPath.replace(/\.mdx?$/, '').replace(/\\/g, '/');
    const url = `https://docs.cyber.mp/guides/${slug}`;
    const { title, description } = extractDocMetadata(content);
    const baseName = path.basename(doc.relPath, path.extname(doc.relPath));

    const sectionRecords = parseMarkdownSections(
      content,
      slug,
      url,
      title || baseName,
      description || `CyberMP documentation guide for ${slug}`,
    );
    guides.push(...sectionRecords);
  }

  // Scan skills/cybermp-dev/references/**/*.md recursively
  if (hasReferences) {
    const refFiles = findDocFiles(referencesDir);
    for (const doc of refFiles) {
      const content = fs.readFileSync(doc.fullPath, 'utf-8');
      const slug = `references/${doc.relPath.replace(/\.md$/, '').replace(/\\/g, '/')}`;
      const url = `https://github.com/cybermp-community/agent-kit/blob/main/skills/cybermp-dev/references/${doc.relPath.replace(/\\/g, '/')}`;
      let { title, description } = extractDocMetadata(content);
      const baseName = path.basename(doc.relPath, path.extname(doc.relPath));
      if (!title || title === 'Untitled') {
        const h1Match = content.match(/^#\s+(.+)$/m);
        title = h1Match ? h1Match[1].trim() : baseName;
      }
      description = description || `Offline reference guide for ${doc.relPath}`;

      const sectionRecords = parseMarkdownSections(
        content,
        slug,
        url,
        title || baseName,
        description,
      );
      guides.push(...sectionRecords.map((record): GuideRecord => ({
        ...record,
        environment: record.environment ?? 'mixed',
        sourceKind: 'kit-reference',
        sourceRevision: null,
        verificationStatus: record.verificationStatus ?? 'unreviewed',
      })));
    }
  }

  guides.sort((a, b) => a.slug.localeCompare(b.slug));
  return guides;
}

export async function buildIndex(options?: {
  outDir?: string;
  docsDir?: string;
  projectRoot?: string;
  project?: Project;
  writeEventReference?: boolean;
}): Promise<BuildIndexResult> {
  const projectRoot = options?.projectRoot || PROJECT_ROOT;
  const project = options?.project || createAstProject(projectRoot);
  const outDir = path.resolve(options?.outDir || path.join(projectRoot, 'src/data'));

  fs.mkdirSync(outDir, { recursive: true });

  console.log('Building index from AST and documentation...');
  const events = parseEventsFromAst({ project, projectRoot });
  if (options?.writeEventReference) {
    const reference = path.join(projectRoot, 'skills/cybermp-dev/references/events.md');
    const source = fs.readFileSync(reference, 'utf8');
    const updated = eventReferenceWithCatalog(source, events);
    if (updated !== source) fs.writeFileSync(reference, updated, 'utf8');
  }
  const types = parseTypesFromAst({ project, projectRoot });
  const guides = parseGuides(options?.docsDir, projectRoot);

  const eventsPath = path.join(outDir, 'events.json');
  const typesPath = path.join(outDir, 'types.json');
  const guidesPath = path.join(outDir, 'guides.json');

  fs.writeFileSync(eventsPath, JSON.stringify(events), 'utf-8');
  fs.writeFileSync(typesPath, JSON.stringify(types), 'utf-8');
  fs.writeFileSync(guidesPath, JSON.stringify(guides), 'utf-8');

  const typeSources = Object.fromEntries(['server', 'client', 'browser'].map((env) => {
    const name = `@cybermp/${env}-types`;
    const { version } = JSON.parse(fs.readFileSync(path.join(projectRoot, 'node_modules', name, 'package.json'), 'utf8'));
    return [env, `${name}@${version}`];
  }));
  fs.writeFileSync(path.join(outDir, 'type-sources.json'), JSON.stringify(typeSources, null, 2) + '\n');

  const eventsSize = fs.statSync(eventsPath).size;
  const typesSize = fs.statSync(typesPath).size;
  const guidesSize = fs.statSync(guidesPath).size;
  const totalSize = eventsSize + typesSize + guidesSize;

  console.log(`Index successfully built into ${outDir}:`);
  console.log(`- events.json: ${events.length} records (${Math.round(eventsSize / 1024)} KB)`);
  console.log(`- types.json: ${types.length} records (${Math.round(typesSize / 1024)} KB)`);
  console.log(`- guides.json: ${guides.length} records (${Math.round(guidesSize / 1024)} KB)`);
  console.log(`- Total uncompressed size: ${Math.round(totalSize / 1024)} KB`);

  return {
    eventsCount: events.length,
    typesCount: types.length,
    guidesCount: guides.length,
    eventsPath,
    typesPath,
    guidesPath,
  };
}

const isDirectExecution = Boolean(
  process.argv[1] &&
    (process.argv[1].endsWith('build-index.ts') || process.argv[1].endsWith('build-index.js'))
);

if (isDirectExecution) {
  buildIndex({ writeEventReference: true }).then(() => buildNativeIndex()).catch((err) => {
    console.error('buildIndex failed:', err);
    process.exit(1);
  });
}
