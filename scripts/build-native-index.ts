import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import ts from 'typescript';
import type { MethodRecord, NativeTypeIndex, PropertyRecord, TypeRecord } from '../src/types/index.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function parseNativeTypes(declarations: string): TypeRecord[] {
  const file = ts.createSourceFile('game.d.ts', declarations, ts.ScriptTarget.Latest, false);
  const types: TypeRecord[] = [];
  for (const declaration of file.statements) {
    if (!ts.isClassDeclaration(declaration) && !ts.isInterfaceDeclaration(declaration)) continue;
    if (!declaration.name || !ts.getModifiers(declaration)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const methods: MethodRecord[] = [];
    const properties: PropertyRecord[] = [];
    for (const member of declaration.members) {
      if (!ts.isMethodDeclaration(member) && !ts.isMethodSignature(member)
        && !ts.isPropertyDeclaration(member) && !ts.isPropertySignature(member)) continue;
      if (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)) continue;
      const name = member.name.text;
      const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
      const isStatic = modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword);
      if (ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) {
        const methodText = member.getText(file).slice(member.name.getEnd() - member.getStart(file)).trimEnd();
        methods.push({
          name,
          signature: `${isStatic ? 'static ' : ''}${name}${methodText.replace(/;$/, '')}`,
          parameters: member.parameters.map((parameter) => ({
            name: parameter.name.getText(file),
            type: parameter.type?.getText(file) ?? 'any',
            ...(parameter.questionToken ? { optional: true } : {}),
            ...(parameter.dotDotDotToken ? { isRest: true } : {}),
          })),
          returnType: member.type?.getText(file) ?? 'void',
        });
      } else {
        properties.push({
          name,
          type: member.type?.getText(file) ?? 'any',
          ...(member.questionToken ? { optional: true } : {}),
          ...(modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword) ? { readonly: true } : {}),
          ...(isStatic ? { static: true } : {}),
        });
      }
    }
    const bases = declaration.heritageClauses
      ?.filter((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
      .flatMap((clause) => clause.types.map((base) => base.expression.getText(file)));
    types.push({
      name: declaration.name.text,
      kind: ts.isClassDeclaration(declaration) ? 'class' : 'interface',
      env: 'client',
      properties,
      methods,
      ...(bases?.length ? { extends: bases } : {}),
    });
  }
  return types.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

export function buildNativeIndex(
  root = projectRoot,
  outDir = path.join(root, 'data'),
): NativeTypeIndex {
  const installedPackage = path.join(root, 'node_modules/@cybermp/client-types');
  const { version: packageVersion } = JSON.parse(fs.readFileSync(path.join(installedPackage, 'package.json'), 'utf8'));
  const declarations = fs.readFileSync(path.join(installedPackage, 'out/game.d.ts'), 'utf8');
  const types = parseNativeTypes(declarations);
  if (typeof packageVersion !== 'string' || types.length === 0) {
    throw new Error('Cannot build native index from an empty or unversioned TypeScript package');
  }
  const index = { packageVersion, types };
  fs.mkdirSync(outDir, { recursive: true });
  const archive = gzipSync(JSON.stringify(index), { level: 9 });
  archive[9] = 255; // Normalize the gzip OS byte across build hosts.
  fs.writeFileSync(path.join(outDir, 'native-types.json.gz'), archive);
  fs.copyFileSync(path.join(installedPackage, 'LICENSE'), path.join(outDir, 'LICENSE-cybermp-client-types'));
  return index;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { packageVersion, types } = buildNativeIndex();
  console.log(`Indexed ${types.length} native types from @cybermp/client-types@${packageVersion}`);
}
