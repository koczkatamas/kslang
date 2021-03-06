import { BinaryExpression, ConditionalExpression, Expression, Identifier, InstanceOfExpression, NumericLiteral, PropertyAccessExpression, StringLiteral, TemplateString, UnresolvedCallExpression } from "../One/Ast/Expressions";
import { BooleanValue, ICallableValue, IVMValue, NumericValue, ObjectValue, StringValue } from "./Values";

export interface IVMHooks {
    propAccess(obj: IVMValue, propName: string): IVMValue;
    stringifyValue(value: IVMValue): string;
}

export class VMContext {
    constructor(public model: ObjectValue, public hooks: IVMHooks = null) { }
}

export class ExprVM {
    constructor(public context: VMContext) { }

    propAccess(obj: IVMValue, propName: string): IVMValue {
        if (this.context.hooks !== null) {
            const value = this.context.hooks.propAccess(obj, propName);
            if (value !== null) return value;
        }

        if (!(obj instanceof ObjectValue)) throw new Error("You can only access a property of an object!");
        if (!(propName in (<ObjectValue>obj).props)) throw new Error(`Property '${propName}' does not exists on this object!`);
        return (<ObjectValue>obj).props[propName];
    }

    evaluate(expr: Expression): IVMValue {
        if (expr instanceof Identifier) {
            return this.propAccess(this.context.model, expr.text);
        } else if (expr instanceof PropertyAccessExpression) {
            const objValue = this.evaluate(expr.object);
            return this.propAccess(objValue, expr.propertyName);
        } else if (expr instanceof UnresolvedCallExpression) {
            const func = <ICallableValue> this.evaluate(expr.func);
            const args = expr.args.map(x => this.evaluate(x));
            const result = func.call(args);
            return result;
        } else if (expr instanceof StringLiteral) {
            return new StringValue(expr.stringValue);
        } else if (expr instanceof NumericLiteral) {
            return new NumericValue(parseInt(expr.valueAsText));
        } else if (expr instanceof ConditionalExpression) {
            const condResult = this.evaluate(expr.condition);
            const result = this.evaluate((<BooleanValue>condResult).value ? expr.whenTrue : expr.whenFalse);
            return result;
        } else if (expr instanceof TemplateString) {
            let result = "";
            for (const part of expr.parts) {
                if (part.isLiteral) {
                    result += part.literalText;
                } else {
                    const value = this.evaluate(part.expression);
                    result += value instanceof StringValue ? value.value : this.context.hooks.stringifyValue(value);
                }
            }
            return new StringValue(result);
        } else if (expr instanceof BinaryExpression) {
            const left = this.evaluate(expr.left);
            const right = this.evaluate(expr.right);
            if (expr.operator === "==" || expr.operator === "===")
                return new BooleanValue(left.equals(right));
            else if (expr.operator === "!=" || expr.operator === "!==")
                return new BooleanValue(!left.equals(right));
            else
                throw new Error(`Unsupported binary operator: ${expr.operator}`);
        } else 
            throw new Error("Unsupported expression!");
    }
}