import type {
	Statement,
	Program,
	If,
	For,
	SetStatement,
	MemberExpression,
	CallExpression,
	Identifier,
	BinaryExpression,
	UnaryExpression,
} from "./ast";
import type { NumericLiteral, StringLiteral, BooleanLiteral } from "./ast";

export type AnyRuntimeValue =
	| NumericValue
	| StringValue
	| BooleanValue
	| ObjectValue
	| ArrayValue
	| FunctionValue
	| NullValue;

/**
 * Abstract base class for all Runtime values.
 * Should not be instantiated directly.
 */
abstract class RuntimeValue<T> {
	type = "RuntimeValue";
	value: T;

	/**
	 * A collection of built-in functions for this type.
	 */
	builtins = new Map<string, AnyRuntimeValue>();

	/**
	 * Creates a new RuntimeValue.
	 */
	constructor(value: T = undefined as unknown as T) {
		this.value = value;
	}
}

/**
 * Represents a numeric value at runtime.
 */
export class NumericValue extends RuntimeValue<number> {
	override type = "NumericValue";
}

/**
 * Represents a string value at runtime.
 */
export class StringValue extends RuntimeValue<string> {
	override type = "StringValue";

	override builtins = new Map<string, AnyRuntimeValue>([
		[
			"upper",
			new FunctionValue(() => {
				return new StringValue(this.value.toUpperCase());
			}),
		],
		[
			"lower",
			new FunctionValue(() => {
				return new StringValue(this.value.toLowerCase());
			}),
		],
		[
			"strip",
			new FunctionValue(() => {
				return new StringValue(this.value.trim());
			}),
		],
		["length", new NumericValue(this.value.length)],
	]);
}

/**
 * Represents a boolean value at runtime.
 */
export class BooleanValue extends RuntimeValue<boolean> {
	override type = "BooleanValue";
}

/**
 * Represents an Object value at runtime.
 */
export class ObjectValue extends RuntimeValue<Map<string, AnyRuntimeValue>> {
	override type = "ObjectValue";
}

/**
 * Represents an Array value at runtime.
 */
export class ArrayValue extends RuntimeValue<AnyRuntimeValue[]> {
	override type = "ArrayValue";
}

/**
 * Represents a Function value at runtime.
 */
export class FunctionValue extends RuntimeValue<(args: AnyRuntimeValue[], scope: Environment) => AnyRuntimeValue> {
	override type = "FunctionValue";
}

/**
 * Represents a Null value at runtime.
 */
export class NullValue extends RuntimeValue<null> {
	override type = "NullValue";
}

/**
 * Represents the current environment (scope) at runtime.
 */
export class Environment {
	/**
	 * The variables declared in this environment.
	 */
	variables: Map<string, AnyRuntimeValue> = new Map();

	constructor(public parent?: Environment) {}

	/**
	 * Set the value of a variable in the current environment.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
	set(name: string, value: any): AnyRuntimeValue {
		return this.declareVariable(name, convertToRuntimeValues(value));
	}

	private declareVariable(name: string, value: AnyRuntimeValue): AnyRuntimeValue {
		if (this.variables.has(name)) {
			throw new SyntaxError(`Variable already declared: ${name}`);
		}
		this.variables.set(name, value);
		return value;
	}

	// private assignVariable(name: string, value: AnyRuntimeValue): AnyRuntimeValue {
	// 	const env = this.resolve(name);
	// 	env.variables.set(name, value);
	// 	return value;
	// }

	/**
	 * Declare if doesn't exist, assign otherwise.
	 */
	setVariable(name: string, value: AnyRuntimeValue): AnyRuntimeValue {
		let env: Environment | undefined;
		try {
			env = this.resolve(name);
		} catch {
			/* empty */
		}
		(env ?? this).variables.set(name, value);
		return value;
	}

	/**
	 * Resolve the environment in which the variable is declared.
	 * @param {string} name The name of the variable.
	 * @returns {Environment} The environment in which the variable is declared.
	 */
	private resolve(name: string): Environment {
		if (this.variables.has(name)) {
			return this;
		}

		// Traverse scope chain
		if (this.parent) {
			return this.parent.resolve(name);
		}

		throw new Error(`Unknown variable: ${name}`);
	}

	lookupVariable(name: string): AnyRuntimeValue {
		return this.resolve(name).variables.get(name) ?? new NullValue();
	}
}

export class Interpreter {
	global: Environment;

	constructor(env?: Environment) {
		this.global = env ?? new Environment();
	}

	/**
	 * Run the program.
	 */
	run(program: Program): AnyRuntimeValue {
		return this.evaluate(program, this.global);
	}

	/**
	 * Evaulates expressions following the binary operation type.
	 */
	private evaluateBinaryExpression(node: BinaryExpression, environment: Environment): AnyRuntimeValue {
		const left = this.evaluate(node.left, environment);
		const right = this.evaluate(node.right, environment);
		if (left instanceof NullValue || right instanceof NullValue) {
			throw new Error("Cannot perform operation on null value");
		} else if (left instanceof NumericValue && right instanceof NumericValue) {
			// Evaulate pure numeric operations with binary operators.
			switch (node.operator.value) {
				// Arithmetic operators
				case "+":
					return new NumericValue(left.value + right.value);
				case "-":
					return new NumericValue(left.value - right.value);
				case "*":
					return new NumericValue(left.value * right.value);
				case "/":
					return new NumericValue(left.value / right.value);
				case "%":
					return new NumericValue(left.value % right.value);

				// Comparison operators
				case "<":
					return new BooleanValue(left.value < right.value);
				case ">":
					return new BooleanValue(left.value > right.value);
				case ">=":
					return new BooleanValue(left.value >= right.value);
				case "<=":
					return new BooleanValue(left.value <= right.value);
				case "==":
					return new BooleanValue(left.value == right.value);
				case "!=":
					return new BooleanValue(left.value != right.value);

				default:
					throw new SyntaxError(`Unknown operator: ${node.operator.value}`);
			}
		} else if (left instanceof BooleanValue && right instanceof BooleanValue) {
			// Logical operators
			switch (node.operator.value) {
				case "and":
					return new BooleanValue(left.value && right.value);
				case "or":
					return new BooleanValue(left.value || right.value);
				case "!=":
					return new BooleanValue(left.value != right.value);
				default:
					throw new SyntaxError(`Unknown operator: ${node.operator.value}`);
			}
		} else {
			switch (node.operator.value) {
				case "+":
					return new StringValue(left.value.toString() + right.value.toString());
				case "==":
					return new BooleanValue(left.value == right.value);
				case "!=":
					return new BooleanValue(left.value != right.value);
				default:
					throw new SyntaxError(`Unknown operator: ${node.operator.value}`);
			}
		}
	}

	/**
	 * Evaulates expressions following the unary operation type.
	 */
	private evaluateUnaryExpression(node: UnaryExpression, environment: Environment): AnyRuntimeValue {
		const argument = this.evaluate(node.argument, environment);

		switch (node.operator.value) {
			case "not":
				return new BooleanValue(!argument.value);
			default:
				throw new SyntaxError(`Unknown operator: ${node.operator.value}`);
		}
	}

	private evalProgram(program: Program, environment: Environment): AnyRuntimeValue {
		return this.evaluateBlock(program.body, environment);
	}

	private evaluateBlock(statements: Statement[], environment: Environment): StringValue {
		// Jinja templates always evaluate to a String,
		// so we accumulate the result of each statement into a final string

		let result = "";
		for (const statement of statements) {
			const lastEvaluated = this.evaluate(statement, environment);

			if (lastEvaluated.type !== "NullValue") {
				result += lastEvaluated.value;
			}
		}

		return new StringValue(result);
	}

	private evaluateIdentifier(node: Identifier, environment: Environment): AnyRuntimeValue {
		return environment.lookupVariable(node.value);
	}

	private evaluateCallExpression(expr: CallExpression, environment: Environment): AnyRuntimeValue {
		const args = expr.args.map((arg) => this.evaluate(arg, environment) as AnyRuntimeValue);
		const fn = this.evaluate(expr.callee, environment);
		if (fn.type !== "FunctionValue") {
			throw new Error(`Cannot call something that is not a function: got ${fn.type}`);
		}
		return (fn as FunctionValue).value(args, environment);
	}

	private evaluateMemberExpression(expr: MemberExpression, environment: Environment): AnyRuntimeValue {
		const property = expr.computed
			? this.evaluate(expr.property, environment)
			: new StringValue((expr.property as Identifier).value);

		if (!(property instanceof StringValue)) {
			// TODO integer indexing for arrays
			throw new Error(`Cannot access property with non-string: got ${property.type}`);
		}

		const object = this.evaluate(expr.object, environment);

		const value =
			object instanceof ObjectValue
				? object.value.get(property.value) ?? object.builtins.get(property.value)
				: object.builtins.get(property.value);

		if (!(value instanceof RuntimeValue)) {
			throw new Error(`${object.type} has no property '${property.value}'`);
		}
		return value;
	}

	private evaluateSet(node: SetStatement, environment: Environment): NullValue {
		if (node.assignee.type !== "Identifier") {
			throw new Error(`Invalid LHS inside assignment expression: ${JSON.stringify(node.assignee)}`);
		}

		const variableName = (node.assignee as Identifier).value;
		environment.setVariable(variableName, this.evaluate(node.value, environment));
		return new NullValue();
	}

	private evaluateIf(node: If, environment: Environment): StringValue {
		const test = this.evaluate(node.test, environment);
		if (!["BooleanValue", "BooleanLiteral"].includes(test.type)) {
			throw new Error(`Expected boolean expression in if statement: got ${test.type}`);
		}
		return this.evaluateBlock(test.value ? node.body : node.alternate, environment);
	}

	private evaluateFor(node: For, environment: Environment): StringValue {
		// Scope for the for loop
		const scope = new Environment(environment);

		const iterable = this.evaluate(node.iterable, scope);
		if (!(iterable instanceof ArrayValue)) {
			throw new Error(`Expected object in for loop: got ${iterable.type}`);
		}

		let result = "";

		for (let i = 0; i < iterable.value.length; ++i) {
			// Update the loop variable
			// TODO: Only create object once, then update value?
			scope.setVariable(
				"loop",
				new ObjectValue(
					new Map(
						(
							[
								["index", new NumericValue(i + 1)],
								["index0", new NumericValue(i)],
								["first", new BooleanValue(i === 0)],
								["last", new BooleanValue(i === iterable.value.length - 1)],
								["length", new NumericValue(iterable.value.length)],
							] as [string, AnyRuntimeValue][]
						).map(([key, value]) => [key, value])
					)
				)
			);

			// For this iteration, set the loop variable to the current element
			scope.setVariable(node.loopvar.value, iterable.value[i]);

			// Evaluate the body of the for loop
			const evaluated = this.evaluateBlock(node.body, scope);
			result += evaluated.value;
		}

		return new StringValue(result);
	}

	evaluate(statement: Statement, environment: Environment): AnyRuntimeValue {
		switch (statement.type) {
			// Program
			case "Program":
				return this.evalProgram(statement as Program, environment);

			// Statements
			case "Set":
				return this.evaluateSet(statement as SetStatement, environment);
			case "If":
				return this.evaluateIf(statement as If, environment);
			case "For":
				return this.evaluateFor(statement as For, environment);

			// Expressions
			case "NumericLiteral":
				return new NumericValue(Number((statement as NumericLiteral).value));
			case "StringLiteral":
				return new StringValue((statement as StringLiteral).value);
			case "BooleanLiteral":
				return new BooleanValue((statement as BooleanLiteral).value);
			case "Identifier":
				return this.evaluateIdentifier(statement as Identifier, environment);
			case "CallExpression":
				return this.evaluateCallExpression(statement as CallExpression, environment);
			case "MemberExpression":
				return this.evaluateMemberExpression(statement as MemberExpression, environment);

			case "UnaryExpression":
				return this.evaluateUnaryExpression(statement as UnaryExpression, environment);
			case "BinaryExpression":
				return this.evaluateBinaryExpression(statement as BinaryExpression, environment);

			default:
				throw new SyntaxError(`Unknown node type: ${statement.type}`);
		}
	}
}

/**
 * Helper function to convert JavaScript values to runtime values.
 */
function convertToRuntimeValues(input: unknown): AnyRuntimeValue {
	switch (typeof input) {
		case "number":
			return new NumericValue(input);
		case "string":
			return new StringValue(input);
		case "boolean":
			return new BooleanValue(input);
		case "object":
			if (input === null) {
				return new NullValue();
			} else if (Array.isArray(input)) {
				return new ArrayValue(input.map(convertToRuntimeValues));
			} else {
				return new ObjectValue(
					new Map(Object.entries(input).map(([key, value]) => [key, convertToRuntimeValues(value)]))
				);
			}
		case "function":
			// Wrap the user's function in a runtime function
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			return new FunctionValue((args, scope) => {
				// NOTE: `scope` is not used since it's in the global scope
				const result = input(...args.map((x) => x.value)) ?? null; // map undefined -> null
				return convertToRuntimeValues(result);
			});
		default:
			throw new Error(`Cannot convert to runtime value: ${input}`);
	}
}