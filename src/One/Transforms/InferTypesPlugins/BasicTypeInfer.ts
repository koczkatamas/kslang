import { InferTypesPlugin } from "./Helpers/InferTypesPlugin";
import { Expression, CastExpression, ParenthesizedExpression, BooleanLiteral, NumericLiteral, StringLiteral, TemplateString, RegexLiteral, InstanceOfExpression, NullLiteral, UnaryExpression, BinaryExpression, ConditionalExpression, NewExpression, NullCoalesceExpression, LambdaCallExpression } from "../../Ast/Expressions";
import { ThisReference, MethodParameterReference, VariableDeclarationReference, ForeachVariableReference, ForVariableReference, SuperReference } from "../../Ast/References";
import { ClassType, InterfaceType, Type, AnyType, EnumType, LambdaType, AmbiguousType } from "../../Ast/AstTypes";

export class BasicTypeInfer extends InferTypesPlugin {
    name = "BasicTypeInfer";

    canDetectType(expr: Expression) { return true; }

    detectType(expr: Expression): boolean {
        const litTypes = this.main.currentFile.literalTypes;

        if (expr instanceof CastExpression) {
            expr.setActualType(expr.newType);
        } else if (expr instanceof ParenthesizedExpression) {
            expr.setActualType(expr.expression.getType());
        } else if (expr instanceof ThisReference) {
            expr.setActualType(expr.cls.type); // remove type arguments from this
        } else if (expr instanceof SuperReference) {
            expr.setActualType(expr.cls.type);
        } else if (expr instanceof MethodParameterReference) {
            expr.setActualType(expr.decl.type);
        } else if (expr instanceof BooleanLiteral) {
            expr.setActualType(litTypes.boolean);
        } else if (expr instanceof NumericLiteral) {
            expr.setActualType(litTypes.numeric);
        } else if (expr instanceof StringLiteral || expr instanceof TemplateString) {
            expr.setActualType(litTypes.string);
        } else if (expr instanceof RegexLiteral) {
            expr.setActualType(litTypes.regex);
        } else if (expr instanceof InstanceOfExpression) {
            expr.setActualType(litTypes.boolean);
        } else if (expr instanceof NullLiteral) {
            expr.setActualType(expr.expectedType !== null ? expr.expectedType : AmbiguousType.instance);
        } else if (expr instanceof VariableDeclarationReference) {
            expr.setActualType(expr.decl.type);
        } else if (expr instanceof ForeachVariableReference) {
            expr.setActualType(expr.decl.type);
        } else if (expr instanceof ForVariableReference) {
            expr.setActualType(expr.decl.type);
        } else if (expr instanceof UnaryExpression) {
            const operandType = expr.operand.getType();
            if (operandType instanceof ClassType) {
                const opId = `${expr.operator}${operandType.decl.name}`;

                if (opId === "-TsNumber") {
                    expr.setActualType(litTypes.numeric);
                } else if (opId === "!TsBoolean") {
                    expr.setActualType(litTypes.boolean);
                } else if (opId === "++TsNumber") {
                    expr.setActualType(litTypes.numeric);
                } else if (opId === "--TsNumber") {
                    expr.setActualType(litTypes.numeric);
                } else {
                    debugger;
                }
            } else if (operandType instanceof AnyType) {
                expr.setActualType(AnyType.instance);
            } else {
                debugger;
            }
        } else if (expr instanceof BinaryExpression) {
            const leftType = expr.left.getType();
            const rightType = expr.right.getType();
            const isEqOrNeq = expr.operator === "==" || expr.operator === "!=";
            if (expr.operator === "=") {
                if (Type.isAssignableTo(rightType, leftType))
                    expr.setActualType(leftType);
                else
                    throw new Error(`Right-side expression (${rightType.repr()}) is not assignable to left-side (${leftType.repr()}).`);
            } else if (isEqOrNeq && (leftType instanceof AnyType || rightType instanceof AnyType)) {
                expr.setActualType(litTypes.boolean);
            } else if (leftType instanceof ClassType && rightType instanceof ClassType) {
                if (leftType.decl === litTypes.numeric.decl && rightType.decl === litTypes.numeric.decl && ["-", "+", "-=", "+=", "%"].includes(expr.operator))
                    expr.setActualType(litTypes.numeric);
                else if (leftType.decl === litTypes.numeric.decl && rightType.decl === litTypes.numeric.decl && ["<", "<=", ">", ">="].includes(expr.operator))
                    expr.setActualType(litTypes.boolean);
                else if (leftType.decl === litTypes.string.decl && rightType.decl === litTypes.string.decl && ["+", "+="].includes(expr.operator))
                    expr.setActualType(litTypes.string);
                else if (leftType.decl === litTypes.boolean.decl && rightType.decl === litTypes.boolean.decl && ["||", "&&"].includes(expr.operator))
                    expr.setActualType(litTypes.boolean);
                else if (leftType.decl === rightType.decl && isEqOrNeq)
                    expr.setActualType(litTypes.boolean);
                else {
                    debugger;
                }
            } else if ((leftType instanceof ClassType || leftType instanceof InterfaceType) && expr.right instanceof NullLiteral && isEqOrNeq) {
                expr.setActualType(litTypes.boolean);
            } else if (leftType instanceof EnumType && rightType instanceof EnumType) {
                if (leftType.decl === rightType.decl && isEqOrNeq)
                    expr.setActualType(litTypes.boolean);
                else
                    debugger;
            } else if (leftType instanceof AnyType && rightType instanceof AnyType) {
                expr.setActualType(AnyType.instance);
            } else {
                debugger;
            }
        } else if (expr instanceof ConditionalExpression) {
            const trueType = expr.whenTrue.getType();
            const falseType = expr.whenFalse.getType();
            if (Type.equals(trueType, falseType))
                expr.setActualType(trueType);
            else if (expr.whenTrue instanceof NullLiteral)
                expr.setActualType(falseType);
            else if (expr.whenFalse instanceof NullLiteral)
                expr.setActualType(trueType);
            else
                throw new Error(`Different types in the whenTrue (${trueType.repr()}) and whenFalse (${falseType.repr()}) expressions of a conditional expression`);
        } else if (expr instanceof NullCoalesceExpression) {
            const defaultType = expr.defaultExpr.getType();
            const ifNullType = expr.exprIfNull.getType();
            if (!Type.isAssignableTo(ifNullType, defaultType))
                this.errorMan.throw(`Null-coalescing operator tried to assign incompatible type "${ifNullType.repr()}" to "${defaultType.repr()}"`);
            else 
                expr.setActualType(defaultType);
        } else {
            return false;
        }

        return true;
    }
}