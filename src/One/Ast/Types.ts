import { ClassType, GenericsType, EnumType, InterfaceType } from "./AstTypes";
import { Expression } from "./Expressions";
import { ClassReference, EnumReference, ThisReference, MethodParameterReference, SuperReference, StaticFieldReference, EnumMemberReference, InstanceFieldReference, StaticPropertyReference, InstancePropertyReference, IReferencable, Reference, GlobalFunctionReference, StaticThisReference, VariableReference } from "./References";
import { AstHelper } from "./AstHelper";
import { Block } from "./Statements";
import { IType } from "./Interfaces";

export interface IAstNode { }

export enum Visibility { Public, Protected, Private }

export class MutabilityInfo {
    constructor(public unused: boolean, public reassigned: boolean, public mutated: boolean) { }
}

/// types: ForeachVariable, Property
///   IVariableWithInitializer: VariableDeclaration, ForVariable, Field, MethodParameter
export interface IVariable {
    name: string;
    type: IType;
    mutability: MutabilityInfo;
}

export interface IClassMember {
    name: string;
    visibility: Visibility;
    isStatic: boolean;
    getParentInterface(): IInterface;
}

/// types: VariableDeclaration, ForVariable, Field, MethodParameter
export interface IVariableWithInitializer extends IVariable {
    initializer: Expression;
}

export interface IHasAttributesAndTrivia {
    leadingTrivia: string;
    attributes: { [name: string]: string };
}

export interface ISourceFileMember {
    parentFile: SourceFile;
}

export class ExportedScope {
    exports = new Map<string, IImportable>();

    getExport(name: string): IImportable {
        const exp = this.exports.get(name) || null;
        if (exp === null)
            throw new Error(`Export ${name} was not found in exported symbols.`);
        return exp;
    }

    addExport(name: string, value: IImportable): void {
        this.exports.set(name, value);
    }

    getAllExports(): IImportable[] { return Array.from(this.exports.values()); }
}

export class Package {
    constructor(public name: string, public definitionOnly: boolean) { }

    static readonly INDEX = "index";

    files: { [name: string]: SourceFile } = {};
    exportedScopes: { [name: string]: ExportedScope } = {};

    static collectExportsFromFile(file: SourceFile, exportAll: boolean, scope: ExportedScope = null): ExportedScope {
        if (scope === null)
            scope = new ExportedScope();

        for (const cls of file.classes.filter(x => x.isExported || exportAll))
            scope.addExport(cls.name, cls);

        for (const intf of file.interfaces.filter(x => x.isExported || exportAll))
            scope.addExport(intf.name, intf);

        for (const enum_ of file.enums.filter(x => x.isExported || exportAll))
            scope.addExport(enum_.name, enum_);
        
        for (const func of file.funcs.filter(x => x.isExported || exportAll))
            scope.addExport(func.name, func);
        
        return scope;
    }

    addFile(file: SourceFile, exportAll = false): void {
        if (file.sourcePath.pkg !== this || file.exportScope.packageName !== this.name)
            throw new Error("This file belongs to another package!");
        
        this.files[file.sourcePath.path] = file;
        const scopeName = file.exportScope.scopeName;
        this.exportedScopes[scopeName] = Package.collectExportsFromFile(file, exportAll, this.exportedScopes[scopeName]);
    }

    getExportedScope(name: string): ExportedScope {
        const scope = this.exportedScopes[name] || null;
        if (scope === null)
            throw new Error(`Scope "${name}" was not found in package "${this.name}"`);
        return scope;
    }
}

export class Workspace {
    packages: { [name: string]: Package } = {};

    addPackage(pkg: Package): void { 
        this.packages[pkg.name] = pkg;
    }

    getPackage(name: string): Package {
        const pkg = this.packages[name] || null;
        if (pkg === null)
            throw new Error(`Package was not found: "${name}"`);
        return pkg;
    }
}

export class SourcePath {
    constructor(
        // @json-ignore
        public pkg: Package,
        public path: string) { }

    toString() { return `${this.pkg.name}/${this.path}`; }
}

export class LiteralTypes {
    constructor(
        public boolean: ClassType,
        public numeric: ClassType,
        public string: ClassType,
        public regex: ClassType,
        public array: ClassType,
        public map: ClassType,
        public error: ClassType,
        public promise: ClassType) { }
}

export class SourceFile {
    /** @creator TypeScriptParser2 */
    constructor(
        public imports: Import[],
        public interfaces: Interface[],
        public classes: Class[],
        public enums: Enum[],
        public funcs: GlobalFunction[],
        public mainBlock: Block,
        public sourcePath: SourcePath,
        public exportScope: ExportScopeRef) {
            const fileScope = Package.collectExportsFromFile(this, true);
            this.addAvailableSymbols(fileScope.getAllExports());
        }

    /** @creator ResolveImports */
    availableSymbols = new Map<string, IImportable>();

    addAvailableSymbols(items: IImportable[]): void {
        for (const item of items)
            this.availableSymbols.set(item.name, item);
    }

    // @json-ignore
    literalTypes: LiteralTypes;
    // @json-ignore
    arrayTypes: ClassType[] = [];
}

export class ExportScopeRef {
    constructor(
        public packageName: string,
        public scopeName: string) { }

    getId(): string { return `${this.packageName}.${this.scopeName}`; }
}

/**
 * The following object types can be imported: Enum, Interface, Class
 */
export class Import implements IHasAttributesAndTrivia, ISourceFileMember {
    /** @creator TypeScriptParser2 */
    constructor(
        /** module and filename in TS, namespace in C#, package name in Go, etc */
        public exportScope: ExportScopeRef,
        public importAll: boolean,
        // @json-ignore
        public imports: IImportable[],
        public importAs: string,
        public leadingTrivia: string) {
            if (importAs !== null && !importAll)
                throw new Error("importAs only supported with importAll!");
        }
    
    /** @creator FillParent */
    // @json-ignore
    parentFile: SourceFile = null;

    /** @creator FillAttributesFromTrivia */
    attributes: { [name: string]: string } = null;
}

export class Enum implements IAstNode, IHasAttributesAndTrivia, IResolvedImportable, ISourceFileMember, IReferencable {
    /** @creator TypeScriptParser2 */
    constructor(
        public name: string,
        public values: EnumMember[],
        public isExported: boolean,
        public leadingTrivia: string) { }

    /** @creator FillParent */
    parentFile: SourceFile = null;
    /** @creator FillAttributesFromTrivia */
    attributes: { [name: string]: string } = null;

    /** @creator ResolveIdentifiers */
    references: EnumReference[] = [];
    createReference(): Reference { return new EnumReference(this); }

    type = new EnumType(this);
}

export class EnumMember implements IAstNode {
    /** @creator TypeScriptParser2 */
    constructor(public name: string) { }

    /** @creator FillParent */
    parentEnum: Enum;
    /** @creator ResolveEnumMemberAccess */
    references: EnumMemberReference[] = [];
}

export interface IInterface {
    name: string;
    typeArguments: string[];
    baseInterfaces: IType[];
    fields: Field[];
    methods: Method[];
    leadingTrivia: string;
    parentFile: SourceFile;
    getAllBaseInterfaces(): IInterface[];
}

export interface IImportable {
    name: string;
    isExported: boolean;
}

export interface IResolvedImportable extends IImportable {
    /** @creator FillParent */
    parentFile: SourceFile;
}

export class UnresolvedImport implements IImportable {
    constructor(public name: string) { }
    isExported = true;
}

export class Interface implements IHasAttributesAndTrivia, IInterface, IResolvedImportable, ISourceFileMember {
    /** @creator TypeScriptParser2 */
    constructor(
        public name: string,
        public typeArguments: string[],
        public baseInterfaces: IType[],
        public fields: Field[],
        public methods: Method[],
        public isExported: boolean,
        public leadingTrivia: string) { }

    /** @creator FillParent */
    parentFile: SourceFile = null;
    /** @creator FillAttributesFromTrivia */
    attributes: { [name: string]: string } = null;

    type = new InterfaceType(this, this.typeArguments.map(x => new GenericsType(x)));

    _baseInterfaceCache: IInterface[] = null;
    getAllBaseInterfaces(): IInterface[] {
        if (this._baseInterfaceCache === null)
            this._baseInterfaceCache = AstHelper.collectAllBaseInterfaces(this);
        return this._baseInterfaceCache;
    }
}

export class Class implements IHasAttributesAndTrivia, IInterface, IResolvedImportable, ISourceFileMember, IReferencable {
    /** @creator TypeScriptParser2 */
    constructor(
        public name: string,
        public typeArguments: string[],
        public baseClass: IType,
        public baseInterfaces: IType[],
        public fields: Field[],
        public properties: Property[],
        public constructor_: Constructor,
        public methods: Method[],
        public isExported: boolean,
        public leadingTrivia: string) { }

    /** @creator FillParent */
    // @json-ignore
    parentFile: SourceFile = null;

    /** @creator FillAttributesFromTrivia */
    attributes: { [name: string]: string } = null;

    /** @creator ResolveIdentifiers */
    // @json-ignore
    classReferences: ClassReference[] = [];
    /** @creator ResolveIdentifiers */
    // @json-ignore
    thisReferences: ThisReference[] = [];
    /** @creator ResolveIdentifiers */
    // @json-ignore
    staticThisReferences: StaticThisReference[] = [];
    /** @creator ResolveIdentifiers */
    // @json-ignore
    superReferences: SuperReference[] = [];
    createReference(): Reference { return new ClassReference(this); }

    // @json-ignore
    type = new ClassType(this, this.typeArguments.map(x => new GenericsType(x)));

    // @json-ignore
    _baseInterfaceCache: IInterface[] = null;
    getAllBaseInterfaces(): IInterface[] {
        if (this._baseInterfaceCache === null)
            this._baseInterfaceCache = AstHelper.collectAllBaseInterfaces(this);
        return this._baseInterfaceCache;
    }
}

export class Field implements IVariableWithInitializer, IHasAttributesAndTrivia, IClassMember, IAstNode {
    /** @creator TypeScriptParser2 */
    constructor(
        public name: string,
        public type: IType,
        public initializer: Expression,
        public visibility: Visibility,
        public isStatic: boolean,
        // @json-ignore
        public constructorParam: MethodParameter,
        public leadingTrivia: string) { }

    /** @creator FillParent */
    // @json-ignore
    parentInterface: IInterface = null;

    /** @creator FillAttributesFromTrivia */
    attributes: { [name: string]: string } = null;

    /** @creator ResolveFieldAndPropertyAccess */
    // @json-ignore
    staticReferences: StaticFieldReference[] = [];

    /** @creator ResolveFieldAndPropertyAccess */
    // @json-ignore
    instanceReferences: InstanceFieldReference[] = [];

    /** @creator CollectInheritanceInfo */
    // @json-ignore
    interfaceDeclarations: Field[] = null;

    /** @creator FillMutability */
    mutability: MutabilityInfo = null;

    getParentInterface(): IInterface { return this.parentInterface; }
}

export class Property implements IVariable, IHasAttributesAndTrivia, IClassMember, IAstNode {
    /** @creator TypeScriptParser2 */
    constructor(
        public name: string,
        public type: IType,
        public getter: Block,
        public setter: Block,
        public visibility: Visibility,
        public isStatic: boolean,
        public leadingTrivia: string) { }

    /** @creator FillParent */
    // @json-ignore
    parentClass: Class = null;

    /** @creator FillAttributesFromTrivia */
    attributes: { [name: string]: string } = null;

    /** @creator ResolveFieldAndPropertyAccess */
    // @json-ignore
    staticReferences: StaticPropertyReference[] = [];

    /** @creator ResolveFieldAndPropertyAccess */
    // @json-ignore
    instanceReferences: InstancePropertyReference[] = [];
    
    /** @creator FillMutability */
    mutability: MutabilityInfo = null;

    getParentInterface(): IInterface { return this.parentClass; }
}

export class MethodParameter implements IVariableWithInitializer, IReferencable, IHasAttributesAndTrivia {
    /** @creator TypeScriptParser2 */
    constructor(
        public name: string,
        public type: IType,
        public initializer: Expression,
        public leadingTrivia: string) { }

    /** @creator TypeScriptParser2 */
    // @json-ignore
    fieldDecl: Field = null;

    /** @creator FillParent */
    // @json-ignore
    parentMethod: IMethodBase = null;

    /** @creator FillAttributesFromTrivia */
    attributes: { [name: string]: string } = null;

    /** @creator ResolveIdentifiers */
    // @json-ignore
    references: MethodParameterReference[] = [];
    createReference(): Reference { return new MethodParameterReference(this); }

    /** @creator FillMutability */
    mutability: MutabilityInfo = null;
}

export interface IMethodBase extends IAstNode {
    parameters: MethodParameter[];
    body: Block;
    throws: boolean;
}

export interface IMethodBaseWithTrivia extends IMethodBase, IHasAttributesAndTrivia {
}

export class Constructor implements IMethodBaseWithTrivia {
    /** @creator TypeScriptParser2 */
    constructor(
        public parameters: MethodParameter[],
        public body: Block,
        public superCallArgs: Expression[],
        public leadingTrivia: string) { }

    /** @creator FillParent */
    // @json-ignore
    parentClass: Class = null;
    /** @creator FillAttributesFromTrivia */
    attributes: { [name: string]: string } = null;

    throws: boolean;
}

export class Method implements IMethodBaseWithTrivia, IClassMember {
    /** @creator TypeScriptParser2 */
    constructor(
        public name: string,
        public typeArguments: string[],
        public parameters: MethodParameter[],
        public body: Block,
        public visibility: Visibility,
        public isStatic: boolean,
        public returns: IType,
        public async: boolean,
        public leadingTrivia: string) { }
    
    /** @creator FillParent */
    // @json-ignore
    parentInterface: IInterface = null;

    /** @creator FillAttributesFromTrivia */
    attributes: { [name: string]: string } = null;

    /** @creator CollectInheritanceInfo */
    // @json-ignore
    interfaceDeclarations: Method[] = null;

    /** @creator CollectInheritanceInfo */
    // @json-ignore
    overrides: Method = null;

    /** @creator CollectInheritanceInfo */
    // @json-ignore
    overriddenBy: Method[] = [];

    throws: boolean;

    getParentInterface(): IInterface { return this.parentInterface; }
}

export class GlobalFunction implements IMethodBaseWithTrivia, IResolvedImportable, IReferencable {
    /** @creator TypeScriptParser2 */
    constructor(
        public name: string,
        public parameters: MethodParameter[],
        public body: Block,
        public returns: IType,
        public isExported: boolean,
        public leadingTrivia: string) { }
    
    /** @creator FillParent */
    parentFile: SourceFile = null;

    /** @creator FillAttributesFromTrivia */
    attributes: { [name: string]: string } = null;

    throws: boolean;

    /** @creator ResolveIdentifiers */
    references: GlobalFunctionReference[] = [];
    createReference(): Reference { return new GlobalFunctionReference(this); }
}

export class Lambda extends Expression implements IMethodBase {
    constructor(
        public parameters: MethodParameter[],
        public body: Block) { super(); }

    returns: IType = null;
    throws: boolean;

    /** @creator LambdaCaptureCollector */
    captures: IVariable[] = null;
}
