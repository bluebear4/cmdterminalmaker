import * as vscode from 'vscode';

interface CommandContext {
	showTags?: string[];
	parameter2ts: Map<string, number>;
}

function visable<T extends { tags?: string[] }>(arg: T, showTags?: string[]): boolean {
	if (arg.tags === undefined) return true;
	return arg.tags.some(tag => showTags?.includes(tag));
}

interface Parameter {
	tags?: string[];
	name: string;
	default?: string;
	placeHolder?: string;
	chosen?: { label: string; description?: string; tags: string[]; addTags: string[] }[];
	sortByTime?: boolean
}

class Command {
	tags?: string[];
	name: string = '';
	command: string = '';
	terminalName?: string;
	parameters: Parameter[];

	constructor(name: string, command: string, terminalName?: string, parameters?: Parameter[], tags?: string[]) {
		this.tags = tags;
		this.name = name;
		this.command = command;
		this.terminalName = terminalName;
		this.parameters = parameters ?? [];
	}

	async execute(context: CommandContext) {
		let terminal = vscode.window.createTerminal(this.terminalName ?? this.name);
		const parameters: string[] = await this.getParameter(context);
		terminal.sendText(`${this.command} ${parameters.join(' ')}`);
		terminal.show();
	}

	async getParameter(context: CommandContext): Promise<string[]> {
		let parameters: string[] = [];
		const { showTags, parameter2ts } = context;
		const tempShowTags = [...showTags ?? []];
		const pOrder = ['label', 'description', 'tags', 'addTags']
		for (let parameter of this.parameters) {
			if (!visable(parameter, showTags)) continue;
			let value: string | undefined = undefined;
			if (parameter.chosen?.length) {
				if (parameter.sortByTime) {
					parameter.chosen = parameter.chosen
						.sort((a, b) => (parameter2ts.get(JSON.stringify(b, pOrder)) ?? 0)
							- (parameter2ts.get(JSON.stringify(a, pOrder)) ?? 0))
				}
				const chosenParameters = new Map(
					parameter.chosen
						.filter(choose => visable(choose, tempShowTags))
						.map((p) => ([p.label, p])))
				const chosen = await vscode.window.showQuickPick(
					parameter.chosen.filter(choose => visable(choose, tempShowTags))
						.map(({ label, description }) => ({ label, description })), {
					placeHolder: parameter.placeHolder,
					matchOnDescription: true,
					ignoreFocusOut: true,
				})
				value = chosen?.label;
				const chosenParameter = chosenParameters.get(value ?? '')
				if (chosenParameter) parameter2ts.set(JSON.stringify(chosenParameter, pOrder), +new Date());
				tempShowTags?.push(...chosenParameter?.addTags ?? [])
			} else {
				value = await vscode.window.showInputBox({
					prompt: `为命令 ${this.command} ${parameters.join(' ')} ${parameters.length > 0 ? '继续' : ''}输入参数 ${parameter.name ?? ''} `,
					placeHolder: parameter.placeHolder,
					value: parameter.default,
					ignoreFocusOut: true,
				});
			}
			if (value === undefined) throw new Error('用户取消输入');
			parameters.push(value.trim());
		}
		return parameters;
	}

}


async function executeCommands(commands: Command[], context: CommandContext) {
	if (commands.length === 0) return;
	let progressOptions = {
		location: vscode.ProgressLocation.Notification,
		cancellable: true
	};

	vscode.window.withProgress(progressOptions, async (progress, token) => {
		return new Promise<void>(async (resolve, reject) => {
			for (let i = 0; i < commands.length; i++) {
				if (token.isCancellationRequested) {
					if (i > 0) vscode.window.showInformationMessage(`已经执行了以下命令：${commands.slice(0, i).map(cmd => cmd.name).join(', ')}`);
					vscode.window.showWarningMessage(`以下命令没有执行：${commands.slice(i).map(cmd => cmd.name).join(', ')}`);
					reject();
					return;
				}
				try {
					progress.report({ increment: 100 / commands.length, message: `当前命令${commands[i].name}, 进度(${i + 1}/${commands.length})` });
					await commands[i].execute(context);
				} catch (error) {
					vscode.window.showErrorMessage(`执行命令${commands[i].name}时出错：${error}`);
					if (i > 0) vscode.window.showInformationMessage(`已经执行了以下命令：${commands.slice(0, i).map(cmd => cmd.name).join(', ')}`);
					vscode.window.showWarningMessage(`以下命令没有执行：${commands.slice(i).map(cmd => cmd.name).join(', ')}`);
					reject(error);
					return;
				}
			}
			resolve();
		});

	});
}

export function activate(context: vscode.ExtensionContext) {
	let parameter2ts: Map<string, number> = context.globalState.get('parameter2ts') ?? new Map<string, number>();
	let create_cmd = vscode.commands.registerCommand('cmdterminalmaker.createTerminal', async () => {
		const showTags: string[] | undefined = vscode.workspace.getConfiguration('cmdterminalmaker').get<string[]>('showTags');
		const commandConfigs: Command[] = vscode.workspace.getConfiguration('cmdterminalmaker').get<Command[]>('commands') ?? [];
		const commands = commandConfigs
			.map((config) => {
				const { name, command, terminalName, parameters: parameters, tags } = config as Command;
				return new Command(name, command, terminalName, parameters, tags);
			}).filter((config) => visable(config, showTags));
		const name2commands: Map<string, Command> = new Map(commands.map(command => [command.name, command]));
		const chosenCmmandNames = await vscode.window.showQuickPick(commands.map(command => command.name), {
			placeHolder: '请选择命令进行执行',
			canPickMany: true,
			matchOnDescription: true
		});
		await executeCommands(chosenCmmandNames?.map(name => name2commands.get(name) as Command) ?? [], { showTags, parameter2ts });
	});
	context.subscriptions.push(create_cmd);
}

export function deactivate() { }