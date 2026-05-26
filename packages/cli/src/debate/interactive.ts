import select from '@inquirer/select';
import chalk from 'chalk';

export interface ModelAnswer {
    modelId: string;
    answer: string;
}

export async function chooseFocus(
    answers: ModelAnswer[],
    allowRandom = true,
    allowAll = true
): Promise<'all' | 'random' | string> {
    const choices = answers.map(a => ({
        name: `${chalk.bold(a.modelId)}: ${a.answer.substring(0, 80)}${a.answer.length > 80 ? '…' : ''}`,
        value: a.modelId,
    }));

    if (allowAll) {
        choices.unshift({ name: '🌐 Debate ALL answers (full round)', value: 'all' });
    }
    if (allowRandom) {
        choices.unshift({ name: '🎲 Pick a random answer to focus on', value: 'random' });
    }

    const selected = await select({
        message: 'Which answer would you like the models to debate?',
        choices,
        pageSize: 10,
    });

    if (selected === 'random') {
        const randomIndex = Math.floor(Math.random() * answers.length);
        return answers[randomIndex].modelId;
    }
    return selected;
}