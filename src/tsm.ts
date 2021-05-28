// import { createProjectSync, ts } from '@ts-morph/bootstrap';
import { Project, ts } from 'ts-morph';

import util from 'util';

export function logInternals(data: any) {
  // console.log({ data });
  console.log(util.inspect(data, false, null, true));
}

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
project.enableLogging();

const sourceFile = project.getSourceFile('server.ts');

const tp = sourceFile?.getClass('BareServer')?.getMember('route');

console.log(
  tp
    ?.getChildrenOfKind(ts.SyntaxKind.Identifier)[0]
    .findReferences()[0]
    .getReferences()
    .filter((ref) => !ref.compilerObject.fileName.includes('server.ts'))[0]
    .getNode()
    .getAncestors()
    .filter((n) => n.getKind() === ts.SyntaxKind.CallExpression)[0]
    .getAncestors()[0]
    .getChildrenOfKind(ts.SyntaxKind.CallExpression)[0]
    .getChildrenOfKind(ts.SyntaxKind.SyntaxList)[0]
    .getChildren()[0]
    .getChildrenOfKind(ts.SyntaxKind.SyntaxList)[0]
    .getChildrenOfKind(ts.SyntaxKind.PropertyAssignment)
    .find((node) =>
      node
        .getChildren()
        .find(
          (n) =>
            n.getKind() === ts.SyntaxKind.ArrowFunction ||
            n.getKind() === ts.SyntaxKind.FunctionExpression,
        ),
    )
    ?.getChildren()
    ?.find((c) => c.getKind() === ts.SyntaxKind.FunctionExpression)
    ?.getLastChild()
    ?.getChildSyntaxList()
    ?.getChildren()
    .find((c) => c.getKind() === ts.SyntaxKind.ReturnStatement)
    ?.getChildren()
    .find((c) => c.getKind() === ts.SyntaxKind.Identifier)
    ?.getType()
    .getSymbol()
    ?.getDeclarations()[0]
    .getChildSyntaxList()
    ?.getChildren()
    .forEach((c) => console.log(c.getType().isUnion())),
);
// ================
// const project = createProjectSync({ tsConfigFilePath: 'tsconfig.json' }); // or createProjectSync
// these are typed as ts.SourceFile
// const myClassFile = project.createSourceFile(
//   'MyClass.ts',
//   'export class MyClass { prop: string; }',
// );
// const mainFile = project.createSourceFile('main.ts', "import { MyClass } from './MyClass'");
// const type = parameter.getType();

// // ts.Program
// const program = project.createProgram();
// console.log({ program });
// // ts.TypeChecker
// const typeChecker = program.getTypeChecker();
// // ts.LanguageService
// const languageService = project.getLanguageService();
// // ts.ModuleResolutionHost
// const moduleResolutionHost = project.getModuleResolutionHost();
