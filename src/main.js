import * as vscode from "vscode";

/**
 * 获取缩进层级
 * @param {string} text
 * @returns {number}
 */
function getIndent(text)
{
    let ret = 0;

    let indentSpace = (
        vscode.window.activeTextEditor != undefined ?
            Number(vscode.window.activeTextEditor.options.indentSize) :
            4
    );
    if (indentSpace == 0 || Number.isNaN(indentSpace))
        indentSpace = 4;

    for (let i = 0; i < text.length; i++)
    {
        if (text[i] == "\t")
            ret++;
        else if (text.slice(i, i + indentSpace) == Array(indentSpace).fill(" ").join(""))
        {
            i += indentSpace - 1;
            ret++;
        }
        else
            break;
    }
    return ret;
}


/**
 * 获取提示文本
 * @returns {string}
 */
function genPromptText()
{
    if (!vscode.window.activeTextEditor)
        return "";
    if (!vscode.workspace.getConfiguration("whereisthis").get("enable"))
        return "";
    if (
        vscode.window.activeTextEditor.document.languageId != "javascript" &&
        vscode.window.activeTextEditor.document.languageId != "typescript"
    )
        return "";

    let path = [];
    let activeLine = vscode.window.activeTextEditor.selection.active.line;

    let enableDocComment = Boolean(vscode.workspace.getConfiguration("whereisthis").get("enableDocComment"));

    let docCommentStartSymbol = "/**";
    let docCommentEndSymbol = "*/";
    let commentSymbol = "//";
    let commentSymbolWithSpace = " // ";

    let indent = Infinity;
    let changeLine = -1;
    let changeLineHadComment = false;
    let changeLineOnlyBrackets = false;

    for (let i = activeLine; i >= 0; i--)
    {
        let nowText = vscode.window.activeTextEditor.document.lineAt(i).text;
        let nowTextTrim = nowText.trim();
        if (nowTextTrim != "") // 非空行
        {
            let nowIndent = getIndent(nowText);
            if (
                nowIndent < indent || // 当前行减小了缩进
                ( // 当前行可能附属于减小缩进的行
                    nowIndent == indent &&
                    changeLine == i + 1 &&
                    (!changeLineHadComment) &&
                    (
                        changeLineOnlyBrackets ||
                        nowTextTrim.slice(0, commentSymbol.length) == commentSymbol
                    )
                )
            )
            { // 行内注释
                if (
                    nowIndent < indent ||  // 当前行减小了缩进
                    changeLineOnlyBrackets
                )
                {
                    indent = nowIndent;
                    changeLine = i;
                }

                let commentIndex = nowText.lastIndexOf(commentSymbolWithSpace);
                let commentText = (
                    commentIndex != -1 ?
                        nowText.slice(commentIndex + commentSymbolWithSpace.length) :
                        ""
                );

                if (commentText != "")
                {
                    path.unshift(commentText);
                }

                changeLineHadComment = (commentIndex != -1);
                changeLineOnlyBrackets = nowTextTrim.split("").every(c => (
                    c == "{" ||
                    c == "[" ||
                    c == "("
                ));
            }
            else if (
                enableDocComment &&
                nowIndent == indent &&
                changeLine == i + 1 &&
                (!changeLineHadComment) &&
                nowTextTrim == docCommentEndSymbol // 当前行是文档注释末
            )
            { // 文档注释
                let docCommentStartLine = -1;

                for (let j = i - 1; j >= 0; j--)
                {
                    let nowLine = vscode.window.activeTextEditor.document.lineAt(j).text;
                    let nowLineTrim = nowLine.trim();
                    if (nowLineTrim == docCommentStartSymbol)
                    { // 文档注释开始处
                        if (j + 1 < i)
                        {
                            let commentFirstLine = vscode.window.activeTextEditor.document.lineAt(j + 1).text;
                            commentFirstLine = commentFirstLine.trim();
                            if (commentFirstLine[0] == "*")
                                commentFirstLine = commentFirstLine.slice(1);
                            commentFirstLine = commentFirstLine.trim();
                            if (commentFirstLine[0] != "@")
                            {
                                path.unshift(commentFirstLine);
                            }
                        }
                        docCommentStartLine = j;
                        break;
                    }
                }

                if (docCommentStartLine != -1)
                    i = docCommentStartLine;
                else
                    break;
            }
        }

        if (
            indent == 0 &&
            changeLine != i
        )
            break;
    }

    return path.join((
        vscode.workspace.getConfiguration("whereisthis").get("pathSeparatorSpace") ?
            (" " + vscode.workspace.getConfiguration("whereisthis").get("pathSeparator") + " ") :
            vscode.workspace.getConfiguration("whereisthis").get("pathSeparator")
    ));
}

/**
 * 获取空行缩进
 * @param {number} lineNum
 * @returns {number}
 */
function getEmptyLineIndent(lineNum)
{
    for (let i = lineNum; i >= 0; i--)
    {
        let nowText = vscode.window.activeTextEditor.document.lineAt(i).text;
        if (nowText.trim() != "") // 非空行
            return getIndent(nowText);
    }
    return 0;
}

/**
 * @type {vscode.TextEditorDecorationType}
 */
let decoration = null;
let oldPromptText = "";
let oldPromptLine = 0;
/** @type {NodeJS.Timeout} */
let timeoutId = null;

/**
 * 更新提示文本
 */
function updatePrompt()
{
    if (vscode.window.activeTextEditor)
    {
        let promptText = genPromptText();
        let activeLine = vscode.window.activeTextEditor.selection.active.line;
        let promptLine = activeLine;
        switch (vscode.workspace.getConfiguration("whereisthis").get("promptedLocation"))
        { // 提示文本显示位置
            case "last line": {
                if (promptLine > 0)
                    promptLine--;
                break;
            }
            case "next line": {
                if (promptLine < vscode.window.activeTextEditor.document.lineCount - 1)
                    promptLine++;
                break;
            }
        }

        if (
            oldPromptLine != promptLine ||
            oldPromptText != promptText
        )
        {
            oldPromptLine = promptLine;
            oldPromptText = promptText;

            if (decoration)
            {
                decoration.dispose();
                decoration = null;
            }

            let promptDistance = vscode.workspace.getConfiguration("whereisthis").get("promptDistance");
            if (promptDistance == null)
                promptDistance = 3.5;

            if (promptText != "")
            {
                decoration = vscode.window.createTextEditorDecorationType({
                    after: {
                        contentText: promptText,
                        color: "rgb(127, 127, 127, 0.8)",
                        margin: (
                            vscode.window.activeTextEditor.document.lineAt(activeLine).text.trim() != "" ?
                                promptDistance + "ch" :
                                (getEmptyLineIndent(activeLine) * 4 + promptDistance) + "ch"
                        )
                    }
                });

                let positionOfLineEnd = new vscode.Position(promptLine, 1e100);
                vscode.window.activeTextEditor.setDecorations(decoration, [
                    new vscode.Range(
                        positionOfLineEnd,
                        positionOfLineEnd
                    )
                ]);
            }
        }
    }
}

/**
 * 激活时
 * @param {vscode.ExtensionContext} extContext
 */
export async function activate(extContext)
{
    let loop = () =>
    {
        timeoutId = null;

        try
        {
            updatePrompt();
        }
        catch (e)
        { }

        let refreshInterval = vscode.workspace.getConfiguration("whereisthis").get("refreshInterval");
        refreshInterval = Math.max(10, refreshInterval);
        refreshInterval = Math.min(10 * 1000, refreshInterval);
        timeoutId = setTimeout(loop, refreshInterval);
    };
    timeoutId = setTimeout(loop, 500);
}

/**
 * 禁用时
 */
export function deactivate()
{
    if (timeoutId)
    {
        clearInterval(timeoutId);
        timeoutId = null;
    }
    if (decoration)
    {
        decoration.dispose();
        decoration = null;
    }
}