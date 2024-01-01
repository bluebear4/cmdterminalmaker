import * as vscode from 'vscode';

interface CommandContext {
	showTags?: string[]
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
	chosen?: { label: string; description?: string; tags: string[] }[];
}

class Command {
	tags?: string[];
	name: string = '';
	command: string = '';
	terminalName?: string;
	parameter: Parameter[];

	constructor(name: string, command: string, terminalName?: string, parameter?: Parameter[], tags?: string[]) {
		this.tags = tags;
		this.name = name;
		this.command = command;
		this.terminalName = terminalName;
		this.parameter = parameter ?? [];
	}

	async execute(context: CommandContext) {
		let terminal = vscode.window.createTerminal(this.terminalName ?? this.name);
		const parameters: string[] = await this.getParameter(context);
		terminal.sendText(`${this.command} ${parameters.join(' ')}`);
		terminal.show();
	}

	async getParameter(context: CommandContext): Promise<string[]> {
		let parameters: string[] = [];
		const { showTags } = context;
		for (let parameter of this.parameter) {
			if (!visable(parameter, showTags)) continue;
			let value = undefined;
			if (parameter.chosen?.length) {
				value = (await vscode.window.showQuickPick(
					parameter.chosen.filter(choose => visable(choose, showTags))
					.map(({label, description}) => ({label, description})), {
					placeHolder: parameter.placeHolder,
					matchOnDescription: true,
					ignoreFocusOut: true,
				}))?.label;
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
	let create_cmd = vscode.commands.registerCommand('cmdterminalmaker.createTerminal', async () => {
		const showTags: string[] | undefined = vscode.workspace.getConfiguration('cmdterminalmaker').get<string[]>('showTags');
		const commandConfigs: Command[] = vscode.workspace.getConfiguration('cmdterminalmaker').get<Command[]>('commands') ?? [];
		const commands = commandConfigs
			.map((config) => {
				const { name, command, terminalName, parameter, tags } = config as Command;
				return new Command(name, command, terminalName, parameter, tags);
			}).filter((config) => visable(config, showTags));
		const name2commands: Map<string, Command> = new Map(commands.map(command => [command.name, command]));
		const chosenCmmandNames = await vscode.window.showQuickPick(commands.map(command => command.name), {
			placeHolder: '请选择命令进行执行',
			canPickMany: true,
			matchOnDescription: true
		});
		await executeCommands(chosenCmmandNames?.map(name => name2commands.get(name) as Command) ?? [], { showTags });
	});
	context.subscriptions.push(create_cmd);
}

export function deactivate() { }