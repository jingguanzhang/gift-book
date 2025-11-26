/**
 * GiftRegistryPDF - 样式配置优化版
 * 仅优化了配置解析和样式管理，核心绘图和布局逻辑保持原样，确保 PDF 输出完全一致。
 */
class GiftRegistryPDF {
    /**
     * 创建一个 PDF 生成器实例。
     */
    constructor(options) {
        // 1. 默认配置合并 (更简洁的写法)
        const defaults = {
            letterSpacing: 4,
            title: '礼金簿',
            giftLabel: '贺礼',
            mainFontUrl: "./static/MaShanZheng-Regular.ttf",
            giftLabelFontUrl: "./static/SourceHanSerifCN-Heavy.ttf",
            formalFontUrl: './static/NotoSansSCMedium-mini.ttf',
            itemsPerPage: 12
        };
        
        this.options = { ...defaults, ...options };
        
        // 确保后续使用的字体URL存在默认值
        this.options.amountFontUrl = this.options.amountFontUrl || this.options.formalFontUrl;
        this.options.coverFontUrl = this.options.coverFontUrl || this.options.formalFontUrl;

        this.pdfLib = PDFLib;
        this.pageSize = [841.89, 595.28]; // A4 横向
        
        // 边距定义
        this.mainPageMargins = { top: 28, bottom: 35, left: 30, right: 30 };
        this.appendixMargins = { top: 70, bottom: 45, left: 60, right: 60 };
        this.footerMargins = { left: 30, right: 30 };

        // 资源状态
        this.resources = {
            fontBytes: null, amountFontBytes: null, formalFontBytes: null,
            giftLabelFontBytes: null, coverFontBytes: null,
            bgImageBytes: null, coverImageBytes: null, backCoverImageBytes: null,
            loaded: false
        };

        this._applyStyleConfig();
    }


    _applyStyleConfig() {
        const overrides = this.options.giftBookStyles || {};

        // 辅助函数：解析数字，无效则返回默认值
        const getNum = (val, def) => (Number.isFinite(Number(val)) && Number(val) > 0) ? Number(val) : def;
        
        // 辅助函数：解析颜色，支持 Hex/RGB，失败则返回默认值
        const getCol = (val, def) => this._parseColor(val || def);

        // 辅助函数：快速生成标准样式对象 { fontSize, color }
        const resolveStyle = (key, defaultSize, defaultColor) => ({
            fontSize: getNum(overrides[key]?.fontSize, defaultSize),
            color: getCol(overrides[key]?.color, defaultColor)
        });

        // 1. 生成各部分样式
        this.styles = {
            name:      resolveStyle('name', 20, '#333333'),
            label:     resolveStyle('label', 20, '#cc0000'),
            amount:    resolveStyle('amount', 20, '#333333'),
            coverText: resolveStyle('coverText', 30, '#f5d4ab'),
            pageInfo: {
                fontSize:   getNum(overrides.pageInfo?.fontSize, 12),
                themeColor: getCol(overrides.pageInfo?.themeColor, '#ec403c'),
                baseColor:  getCol(overrides.pageInfo?.baseColor, '#1f2937')
            }
        };

        // 2. 定义常用颜色画笔
        // 直接复用 rgb 对象，避免重复实例化
        this.colors = {
            red: this.styles.pageInfo.themeColor,
            black: this.styles.pageInfo.baseColor,
            lightPink: this.pdfLib.rgb(1, 0.94, 0.94),
            borderColor: this.pdfLib.rgb(0.99, 0.82, 0.82),
            lightOrange: this.styles.coverText.color
        };
    }

    /**
     * 优化点：使用正则简化逻辑，支持 #RGB, #RRGGBB, rgb() 格式
     */
    _parseColor(input) {
        // 如果已经是颜色对象则直接返回
        if (typeof input === 'object' && input !== null) return input;
        
        const str = String(input || '').trim();
        const { rgb } = this.pdfLib;
        const black = rgb(0, 0, 0);

        if (!str) return black;

        // 处理 Hex: #abc 或 #aabbcc
        if (str.startsWith('#')) {
            const hex = str.replace('#', '');
            if (!/^[0-9a-fA-F]{3,6}$/.test(hex)) return black;
            
            const val = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
            if (val.length !== 6) return black;

            const n = parseInt(val, 16);
            return rgb((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
        }

        // 处理 rgb(r, g, b)
        if (str.toLowerCase().startsWith('rgb')) {
            const match = str.match(/[\d\.]+/g);
            if (match && match.length >= 3) {
                const [r, g, b] = match.map(Number);
                if ([r, g, b].every(n => Number.isFinite(n))) {
                    return rgb(r / 255, g / 255, b / 255);
                }
            }
        }

        return black;
    }

    // =================================================================
    // 下方的逻辑保持原样，以保证布局绝对安全
    // =================================================================

    async _loadResources() {
        if (this.resources.loaded) return;

        const fetchResource = async (url) => {
            if (!url) return null;
            const response = await fetch(url);
            return new Uint8Array(await response.arrayBuffer());
        };

        const loadImage = async (input) => {
            if (!input) return null;
            if (input.startsWith('data:image')) {
                const base64 = input.split(',')[1];
                return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            }
            return fetchResource(input);
        };

        const [fontBytes, bgImageBytes, giftLabelFontBytes, coverImageBytes, backCoverImageBytes, formalFontBytes, amountFontBytes, coverFontBytes] = await Promise.all([
            fetchResource(this.options.mainFontUrl),
            fetchResource(this.options.backgroundImage),
            fetchResource(this.options.giftLabelFontUrl),
            loadImage(this.options.coverImage),
            loadImage(this.options.backCoverImage),
            fetchResource(this.options.formalFontUrl),
            fetchResource(this.options.amountFontUrl),
            fetchResource(this.options.coverFontUrl)
        ]);

        this.resources = {
            fontBytes, bgImageBytes, giftLabelFontBytes, coverImageBytes,
            backCoverImageBytes, formalFontBytes, amountFontBytes, coverFontBytes,
            loaded: true
        };
    }

    _processData(data) {
        const validData = data.filter(item => !item.abolished);
        const grandTotal = validData.reduce((sum, item) => sum + item.amount, 0);
        const remarks = data
            .map((item, index) => ({
                name: item.name,
                remark: item.remark,
                position: `第${Math.floor(index / this.options.itemsPerPage) + 1}页第${(index % this.options.itemsPerPage) + 1}人`
            }))
            .filter(r => r.remark && r.remark.trim());

        const summary = data.reduce((acc, item) => {
            const type = item.type || '其他';
            if (!acc[type]) acc[type] = { count: 0, total: 0 };
            acc[type].count++;
            acc[type].total += item.amount;
            return acc;
        }, {});

        return {
            grandTotal,
            remarks,
            summary,
            totalItems: data.length,
            mainContentTotalPages: Math.ceil(data.length / this.options.itemsPerPage),
            validData
        };
    }

    async _addGiftsPages(pdfDoc, fonts, { validData: data, mainContentTotalPages }) {
        const [pageWidth, pageHeight] = this.pageSize;
        const margin = this.mainPageMargins;
        
        const tableWidth = pageWidth - margin.left - margin.right;
        const tableHeight = pageHeight - margin.top - margin.bottom;
        const colWidth = tableWidth / this.options.itemsPerPage;
        const giftTitleHeight = tableHeight * 0.15;
        const nameHeight = (tableHeight - giftTitleHeight) / 2;
        const amountContainerHeight = nameHeight;
        const numericAmountHeight = 25;
        const chineseAmountHeight = amountContainerHeight - numericAmountHeight;
        const nameStyle = this.styles.name;
        const labelStyle = this.styles.label;
        const amountStyle = this.styles.amount;
        const numericColor = this.styles.pageInfo.baseColor;

        for (let p = 0; p < mainContentTotalPages; p++) {
            const page = pdfDoc.addPage(this.pageSize);
            await this._drawImageOnPage(pdfDoc, page, this.resources.bgImageBytes);
            page.drawRectangle({ x: margin.left, y: margin.bottom, width: tableWidth, height: tableHeight, borderColor: this.colors.red, borderWidth: 2 });
            const line1Y = margin.bottom + amountContainerHeight;
            const line2Y = line1Y + giftTitleHeight;
            page.drawLine({ start: { x: margin.left, y: line1Y }, end: { x: pageWidth - margin.right, y: line1Y }, color: this.colors.red, thickness: 1 });
            page.drawLine({ start: { x: margin.left, y: line2Y }, end: { x: pageWidth - margin.right, y: line2Y }, color: this.colors.red, thickness: 1 });

            for (let i = 1; i < this.options.itemsPerPage; i++) {
                const lineX = margin.left + i * colWidth;
                page.drawLine({ start: { x: lineX, y: margin.bottom }, end: { x: lineX, y: pageHeight - margin.top }, color: this.colors.red, thickness: 1 });
            }

            const pageData = data.slice(p * this.options.itemsPerPage, (p + 1) * this.options.itemsPerPage);
            pageData.forEach((item, i) => {
                const colX = margin.left + i * colWidth;
                const name = item.name.length === 2 ? item.name[0] + String.fromCharCode(0x3000) + item.name[1] : item.name;
                this._drawText(page, name, fonts.mainFont, {
                    x: colX, y: line2Y, cellWidth: colWidth, cellHeight: nameHeight,
                    initialFontSize: nameStyle.fontSize, minFontSize: 8, color: nameStyle.color, isVertical: true
                });
                this._drawText(page, this.options.giftLabel, fonts.giftLabelFont, {
                    x: colX, y: line1Y, cellWidth: colWidth, cellHeight: giftTitleHeight,
                    initialFontSize: labelStyle.fontSize, minFontSize:8, color: labelStyle.color, isVertical: true
                });
                this._drawText(page, item.amountText, fonts.amountFont, {
                    x: colX, y: margin.bottom + numericAmountHeight, cellWidth: colWidth, cellHeight: chineseAmountHeight,
                    initialFontSize: amountStyle.fontSize, minFontSize: 8, color: amountStyle.color, isVertical: true
                });
                this._drawText(page, String.fromCharCode(0x00A5) + item.amount, fonts.formalFont, {
                    x: colX, y: margin.bottom + 5, cellWidth: colWidth, cellHeight: numericAmountHeight,
                    initialFontSize: 12, minFontSize: 6, color: numericColor, isVertical: false
                });
            });
            const pageSubtotal = pageData.reduce((sum, item) => sum + item.amount, 0);
            let pageInfo = `第 ${p + 1} 页 / 共 ${mainContentTotalPages} 页`;
            if (this.options.partIndex && this.options.totalParts) {
                pageInfo += `( P${this.options.partIndex}/P${this.options.totalParts} )`;
            }
            this._drawPageFooter(page, fonts.formalFont, {
                left: `生成日期: ${new Date().toLocaleString('sv-SE')}`,
                center: pageInfo,
                right: `本页小计: ${this._formatRMB(pageSubtotal)}`
            });
        }
    }

    async _addSummaryAppendix(pdfDoc, fonts, processedData) {
        if (!processedData || Object.keys(processedData.summary).length === 0) return;

        const page = pdfDoc.addPage(this.pageSize);
        await this._drawImageOnPage(pdfDoc, page, this.resources.bgImageBytes);

        const mainFont = fonts.formalFont;
        const [pageWidth, pageHeight] = this.pageSize;
        const margin = this.appendixMargins;

        const title = "总计";
        const titleWidth = mainFont.widthOfTextAtSize(title, 28);
        page.drawText(title, { x: (pageWidth - titleWidth) / 2, y: pageHeight - margin.top, size: 28, font: mainFont, color: this.colors.red });

        const tableTopY = pageHeight - margin.top - 40;
        const summaryData = Object.entries(processedData.summary).map(([type, values]) => ({
            method: type, count: `${values.count} 人`, amount: this._formatRMB(values.total)
        }));

        const tableData = [...summaryData];
        const partTotalItems = processedData.totalItems;
        const partTotalAmount = processedData.grandTotal;

        if (this.options.partIndex && this.options.totalParts) {
            tableData.push({ method: "本部分总计", count: `${partTotalItems} 人`, amount: this._formatRMB(partTotalAmount) });
            tableData.push({ method: "事项总金额", count: `${this.options.grandTotalGivers || 0} 人`, amount: this._formatRMB(this.options.grandTotalAmount) });
        } else {
            tableData.push({ method: "总计", count: `${partTotalItems} 人`, amount: this._formatRMB(partTotalAmount) });
        }

        const tableWidth = pageWidth - margin.left - margin.right;
        const colWidths = [tableWidth * 0.3, tableWidth * 0.25, tableWidth * 0.45];
        const rowHeight = 40;
        const headerHeight = 30;

        let cursorY = tableTopY;
        const tableHeaders = ["送礼方式", "人数", "总金额"];

        let currentX = margin.left;
        tableHeaders.forEach((headerText, colIndex) => {
            const textWidth = mainFont.widthOfTextAtSize(headerText, 14);
            page.drawText(headerText, {
                x: currentX + (colWidths[colIndex] - textWidth) / 2, y: cursorY - headerHeight / 2 - 6,
                font: mainFont, size: 14, color: this.colors.black
            });
            currentX += colWidths[colIndex];
        });

        page.drawLine({ start: { x: margin.left, y: cursorY - headerHeight }, end: { x: margin.left + tableWidth, y: cursorY - headerHeight }, color: this.colors.red, thickness: 0.8 });
        cursorY -= headerHeight;

        tableData.forEach((rowData) => {
            const cells = [rowData.method, rowData.count, rowData.amount];
            currentX = margin.left;
            cells.forEach((cellText, colIndex) => {
                const textWidth = mainFont.widthOfTextAtSize(cellText, 14);
                page.drawText(cellText, {
                    x: currentX + (colWidths[colIndex] - textWidth) / 2, y: cursorY - rowHeight / 2 - 7,
                    font: mainFont, size: 14, color: this.colors.black
                });
                currentX += colWidths[colIndex];
            });
            page.drawLine({ start: { x: margin.left, y: cursorY - rowHeight }, end: { x: margin.left + tableWidth, y: cursorY - rowHeight }, color: this.colors.red, thickness: 0.8 });
            cursorY -= rowHeight;
        });

        const tableBottomY = cursorY;
        page.drawLine({ start: { x: margin.left, y: tableTopY }, end: { x: margin.left + tableWidth, y: tableTopY }, color: this.colors.red, thickness: 1.2 });
        page.drawLine({ start: { x: margin.left, y: tableBottomY }, end: { x: margin.left + tableWidth, y: tableBottomY }, color: this.colors.red, thickness: 1.2 });
        page.drawLine({ start: { x: margin.left, y: tableTopY }, end: { x: margin.left, y: tableBottomY }, color: this.colors.red, thickness: 1.2 });
        page.drawLine({ start: { x: margin.left + tableWidth, y: tableTopY }, end: { x: margin.left + tableWidth, y: tableBottomY }, color: this.colors.red, thickness: 1.2 });

        let lineX = margin.left;
        for (let i = 0; i < colWidths.length - 1; i++) {
            lineX += colWidths[i];
            page.drawLine({ start: { x: lineX, y: tableTopY }, end: { x: lineX, y: tableBottomY }, color: this.colors.red, thickness: 0.8 });
        }

        if (this.options.recorder || this.options.subtitle) {
            const recorderText = this.options.recorder ? `记账人:  ${this.options.recorder}` : '';
            const recorderTextWidth = mainFont.widthOfTextAtSize(recorderText, 18);
            const dateTextWidth = this.options.subtitle ? mainFont.widthOfTextAtSize(this.options.subtitle, 18) : 0;
            const maxWidth = Math.max(recorderTextWidth, dateTextWidth);
            const boxStartX = pageWidth - this.appendixMargins.right - maxWidth - 45;
            let cursorY = tableBottomY - 60;

            if (recorderText) {
                const centeredX = boxStartX + (maxWidth - recorderTextWidth) / 2;
                page.drawText(recorderText, { x: centeredX, y: cursorY, font: mainFont, size: 18, color: this.colors.black });
                cursorY -= 30;
            }
            if (this.options.subtitle) {
                const centeredX = boxStartX + (maxWidth - dateTextWidth) / 2;
                page.drawText(this.options.subtitle, { x: centeredX, y: cursorY, font: mainFont, size: 18, color: this.colors.black });
            }
        }
    }

    async _addRemarkAppendix(pdfDoc, fonts, processedData) {
        const remarks = processedData.remarks;
        if (remarks.length === 0) return;

        const mainFont = fonts.formalFont;
        const [pageWidth, pageHeight] = this.pageSize;
        const margin = this.appendixMargins;
        const colWidths = [120, 160, pageWidth - margin.left - margin.right - 280];
        const tableWidth = colWidths.reduce((a, b) => a + b);

        let page = pdfDoc.addPage(this.pageSize);
        let cursorY = pageHeight - margin.top;
        const appendixPages = [page];
        const pageBottoms = {};

        await this._drawImageOnPage(pdfDoc, page, this.resources.bgImageBytes);

        const title = "附录：宾客备注";
        const titleWidth = mainFont.widthOfTextAtSize(title, 28);
        page.drawText(title, { x: (pageWidth - titleWidth) / 2, y: cursorY, size: 28, font: mainFont, color: this.colors.red });
        cursorY -= 40;
        const tableTopYOnFirstPage = cursorY;

        cursorY -= this._drawAppendixHeader(page, mainFont, cursorY, colWidths);

        for (const row of remarks) {
            const { lines, height } = this._wrapText(row.remark, mainFont, 11, colWidths[2] - 12);
            const rowHeight = Math.max(30, height + 10);

            if (cursorY - rowHeight < margin.bottom) {
                pageBottoms[appendixPages.length - 1] = cursorY;
                page = pdfDoc.addPage(this.pageSize);
                appendixPages.push(page);
                await this._drawImageOnPage(pdfDoc, page, this.resources.bgImageBytes);
                cursorY = pageHeight - margin.top;
                cursorY -= this._drawAppendixHeader(page, mainFont, cursorY, colWidths);
            }
            this._drawAppendixRow(page, mainFont, row, cursorY, rowHeight, colWidths, lines);
            cursorY -= rowHeight;
        }
        pageBottoms[appendixPages.length - 1] = cursorY;

        appendixPages.forEach((p, idx) => {
            let appendixPageInfo = `附录 第 ${idx + 1} / ${appendixPages.length} 页`;
            this._drawPageFooter(p, fonts.formalFont, {
                left: `生成日期: ${new Date().toLocaleString('sv-SE')}`,
                center: appendixPageInfo,
                right: this.options.partIndex && this.options.totalParts ? `P${this.options.partIndex}/P${this.options.totalParts}` : null
            });
            const topY = (idx === 0) ? tableTopYOnFirstPage : pageHeight - margin.top;
            const bottomY = pageBottoms[idx];
            p.drawLine({ start: { x: margin.left, y: topY }, end: { x: margin.left + tableWidth, y: topY }, color: this.colors.red, thickness: 1.2 });
            p.drawLine({ start: { x: margin.left, y: topY }, end: { x: margin.left, y: bottomY }, color: this.colors.red, thickness: 1.2 });
            p.drawLine({ start: { x: margin.left + tableWidth, y: topY }, end: { x: margin.left + tableWidth, y: bottomY }, color: this.colors.red, thickness: 1.2 });
            p.drawLine({ start: { x: margin.left, y: bottomY }, end: { x: margin.left + tableWidth, y: bottomY }, color: this.colors.red, thickness: 1.2 });
        });
    }

    _wrapText(text, font, fontSize, maxWidth) {
        const lines = [];
        const paragraphs = String(text || "").split(/\r?\n/);
        for (const paragraph of paragraphs) {
            if (paragraph === '') { lines.push(''); continue; }
            let currentLine = '';
            const words = paragraph.match(/[\w']+|[^\s\w]/g) || [];
            for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                if (font.widthOfTextAtSize(testLine, fontSize) <= maxWidth) {
                    currentLine = testLine;
                } else {
                    lines.push(currentLine);
                    currentLine = word;
                }
            }
            lines.push(currentLine);
        }
        const lineHeight = fontSize + 4;
        return { lines, height: lines.length * lineHeight };
    }

    async _drawImageOnPage(pdfDoc, page, imageBytes) {
        if (!imageBytes) return;
        try {
            const image = await pdfDoc.embedJpg(imageBytes).catch(() => pdfDoc.embedPng(imageBytes));
            const { width, height } = page.getSize();
            page.drawImage(image, { x: 0, y: 0, width, height });
        } catch (error) { console.error("绘制图片失败:", error); }
    }

    _drawPageFooter(page, font, texts) {
        const { width } = page.getSize();
        const { left, right } = this.footerMargins;
        const y = 17;
        const size = this.styles?.pageInfo?.fontSize || 10;
        if (texts.left) page.drawText(texts.left, { x: left, y, size, font, color: this.colors.black });
        if (texts.center) {
            const centerWidth = font.widthOfTextAtSize(texts.center, size);
            page.drawText(texts.center, { x: (width - centerWidth) / 2, y, size, font, color: this.colors.black });
        }
        if (texts.right) {
            const rightWidth = font.widthOfTextAtSize(texts.right, size);
            page.drawText(texts.right, { x: width - right - rightWidth, y, size, font, color: this.colors.black });
        }
    }

    _drawText(page, text, font, options) {
        const { x, y, cellWidth, cellHeight, initialFontSize, minFontSize, color, isVertical } = options;

        if (!isVertical) {
            let fontSize = initialFontSize;
            while (fontSize >= minFontSize && font.widthOfTextAtSize(text, fontSize) > cellWidth * 0.9) {
                fontSize -= 0.5;
            }
            const textWidth = font.widthOfTextAtSize(text, fontSize);
            const textHeight = font.heightAtSize(fontSize);
            page.drawText(text, {
                x: x + (cellWidth - textWidth) / 2,
                y: y + (cellHeight - textHeight) / 2 + textHeight / 10,
                size: fontSize, font, color
            });
            return;
        }

        const MAX_COLS = 3;
        const { letterSpacing } = this.options;
        const chars = [...text];
        if (chars.length === 0) return;

        const cellWidth90 = cellWidth * 0.9;
        const cellHeight90 = cellHeight * 0.9;

        const calcHeight = (numChars, fs) => numChars * (fs + letterSpacing) - (numChars > 0 ? letterSpacing : 0);
        const calcWidth = (numCols, fs) => numCols * fs + (numCols - 1) * letterSpacing;

        const charHeight = initialFontSize + letterSpacing;
        const adaptiveMaxCharsPerCol = Math.max(1, Math.floor((cellHeight90 + letterSpacing) / charHeight));
        const neededCols = Math.ceil(chars.length / adaptiveMaxCharsPerCol);

        let finalColCount;
        let finalFontSize = initialFontSize;
        let finalCharsPerColForHeight;

        if (neededCols === 1) {
            finalColCount = 1;
            finalCharsPerColForHeight = chars.length;
            while (finalFontSize >= minFontSize) {
                let height = calcHeight(finalCharsPerColForHeight, finalFontSize);
                let width = calcWidth(finalColCount, finalFontSize);
                if (height <= cellHeight90 && width <= cellWidth90) break;
                finalFontSize -= 0.5;
            }
        } else if (neededCols === 2) {
            finalColCount = 2;
            finalCharsPerColForHeight = adaptiveMaxCharsPerCol;
            let height = calcHeight(finalCharsPerColForHeight, initialFontSize);
            let width = calcWidth(finalColCount, initialFontSize);
            if (height <= cellHeight90 && width <= cellWidth90) {
                finalFontSize = initialFontSize;
            } else {
                finalColCount = 3;
                finalCharsPerColForHeight = adaptiveMaxCharsPerCol;
                finalFontSize = initialFontSize;
                while (finalFontSize >= minFontSize) {
                    let height = calcHeight(finalCharsPerColForHeight, finalFontSize);
                    let width = calcWidth(finalColCount, finalFontSize);
                    if (height <= cellHeight90 && width <= cellWidth90) break;
                    finalFontSize -= 0.5;
                }
            }
        } else {
            finalColCount = 3;
            finalCharsPerColForHeight = adaptiveMaxCharsPerCol;
            while (finalFontSize >= minFontSize) {
                let height = calcHeight(finalCharsPerColForHeight, finalFontSize);
                let width = calcWidth(finalColCount, finalFontSize);
                if (height <= cellHeight90 && width <= cellWidth90) break;
                finalFontSize -= 0.5;
            }
        }

        if (finalFontSize < minFontSize) finalFontSize = minFontSize;

        const charsPerColForDrawing = adaptiveMaxCharsPerCol;
        const blockHeight = calcHeight(finalCharsPerColForHeight, finalFontSize);
        const blockWidth = calcWidth(finalColCount, finalFontSize);
        const blockLeft = x + (cellWidth - blockWidth) / 2;
        const blockBottom = y + (cellHeight - blockHeight) / 2;

        for (let c = 0; c < finalColCount; c++) {
            const colChars = chars.slice(c * charsPerColForDrawing, (c + 1) * charsPerColForDrawing);
            if (colChars.length === 0) continue;
            const colHeight = calcHeight(colChars.length, finalFontSize);
            const colStartY = blockBottom + (blockHeight - colHeight) / 2 + (colHeight - finalFontSize) + letterSpacing / 2;
            colChars.forEach((char, r) => {
                const charWidth = font.widthOfTextAtSize(char, finalFontSize);
                page.drawText(char, {
                    x: blockLeft + c * (finalFontSize + letterSpacing) + (finalFontSize - charWidth) / 2,
                    y: colStartY - r * (finalFontSize + letterSpacing),
                    size: finalFontSize, font, color
                });
            });
        }
    }

    _drawAppendixHeader(page, font, y, colWidths) {
        const headers = ["姓名", "位置索引", "备注信息"]; const rowHeight = 28; let x = this.appendixMargins.left;
        headers.forEach((header, i) => {
            const textWidth = font.widthOfTextAtSize(header, 14);
            page.drawText(header, { x: x + (colWidths[i] - textWidth) / 2, y: y - rowHeight + (rowHeight - 14) / 2, size: 14, font, color: this.colors.red });
            if (i < headers.length - 1) { page.drawLine({ start: { x: x + colWidths[i], y }, end: { x: x + colWidths[i], y: y - rowHeight }, color: this.colors.red, thickness: 0.8 }); }
            x += colWidths[i];
        });
        const tableWidth = colWidths.reduce((a, b) => a + b);
        page.drawLine({ start: { x: this.appendixMargins.left, y: y - rowHeight }, end: { x: this.appendixMargins.left + tableWidth, y: y - rowHeight }, color: this.colors.red, thickness: 1.2 });
        return rowHeight;
    }

    _drawAppendixRow(page, font, rowData, y, rowHeight, colWidths, wrappedLines) {
        const { name, position } = rowData; const cells = [name, position, wrappedLines]; let x = this.appendixMargins.left;
        for (let i = 0; i < cells.length; i++) {
            const cellWidth = colWidths[i]; const fontSize = 11;
            if (i < 2) {
                const textWidth = font.widthOfTextAtSize(cells[i], fontSize);
                page.drawText(cells[i], { x: x + (cellWidth - textWidth) / 2, y: y - rowHeight + (rowHeight - fontSize) / 2, size: fontSize, font, color: this.colors.black });
            } else {
                const lines = cells[i]; const lineHeight = fontSize + 4; const totalTextHeight = lines.length * lineHeight;
                let offsetY = y - rowHeight + (rowHeight - totalTextHeight) / 2 + totalTextHeight - fontSize;
                lines.forEach(lineText => { page.drawText(lineText.trim(), { x: x + 5, y: offsetY, size: fontSize, font, color: this.colors.black }); offsetY -= lineHeight; });
            }
            if (i < colWidths.length - 1) { page.drawLine({ start: { x: x + cellWidth, y }, end: { x: x + cellWidth, y: y - rowHeight }, color: this.colors.red, thickness: 0.8 }); }
            x += cellWidth;
        }
        page.drawLine({ start: { x: this.appendixMargins.left, y: y - rowHeight }, end: { x: x, y: y - rowHeight }, color: this.colors.red, thickness: 0.8 });
    }

    _formatRMB(amount) {
        const num = parseFloat(amount);
        return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(num || 0);
    }

    async generate(data, newOptions = null) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('数据必须是一个非空数组。');
        }

        if (newOptions) {
            Object.assign(this.options, newOptions);
            this.resources.loaded = false;
            this._applyStyleConfig();
        }

        await this._loadResources();

        const { PDFDocument } = this.pdfLib;
        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(fontkit);

        const fonts = {
            mainFont: await pdfDoc.embedFont(this.resources.fontBytes, { subset: true }),
            giftLabelFont: this.resources.giftLabelFontBytes ? await pdfDoc.embedFont(this.resources.giftLabelFontBytes, { subset: true }) : null,
            formalFont: this.resources.formalFontBytes ? await pdfDoc.embedFont(this.resources.formalFontBytes, { subset: true }) : null,
            amountFont: this.resources.amountFontBytes ? await pdfDoc.embedFont(this.resources.amountFontBytes, { subset: true }) : null,
            coverFont: this.resources.coverFontBytes ? await pdfDoc.embedFont(this.resources.coverFontBytes, { subset: true }) : null
        };
        fonts.giftLabelFont = fonts.giftLabelFont || fonts.mainFont;
        fonts.formalFont = fonts.formalFont || fonts.mainFont;
        fonts.amountFont = fonts.amountFont || fonts.mainFont;
        fonts.coverFont = fonts.coverFont || fonts.formalFont;

        const processedData = this._processData(data);

        if (this.options.printCover && this.resources.coverImageBytes) {
            const coverPage = pdfDoc.addPage(this.pageSize);
            await this._drawImageOnPage(pdfDoc, coverPage, this.resources.coverImageBytes);
            const coverFont = fonts.coverFont || fonts.formalFont;
            const coverStyle = this.styles?.coverText || {};
            const coverColor = coverStyle.color || this.colors.lightOrange;
            const coverFontSize = coverStyle.fontSize || 26;
            if (this.options.showCoverTitle && this.options.title) {
                const titleWidth = coverFont.widthOfTextAtSize(this.options.title, coverFontSize);
                coverPage.drawText(this.options.title, { x: (this.pageSize[0] - titleWidth) / 2, y: 115, size: coverFontSize, font: coverFont, color: coverColor });
            }
            if (this.options.showCoverTitle && this.options.subtitle) {
                const subtitleWidth = coverFont.widthOfTextAtSize(this.options.subtitle, coverFontSize);
                coverPage.drawText(this.options.subtitle, { x: (this.pageSize[0] - subtitleWidth) / 2, y: 80, size: coverFontSize, font: coverFont, color: coverColor });
            }
            if (this.options.partIndex && this.options.showCoverTitle) {
                const partText = 'P' + this.options.partIndex;
                coverPage.drawText(partText, { x: 90, y: this.pageSize[1] - 120, font: coverFont, size: coverFontSize + 20, color: coverColor, opacity: 0.9 });
            }
        }

        await this._addGiftsPages(pdfDoc, fonts, processedData);

        if (this.options.printAppendix !== false) {
            await this._addRemarkAppendix(pdfDoc, fonts, processedData);
        }

        if (this.options.printSummary !== false) {
            await this._addSummaryAppendix(pdfDoc, fonts, processedData);
        }

        if (this.options.printEndPage !== false && this.resources.backCoverImageBytes) {
            const backPage = pdfDoc.addPage(this.pageSize);
            await this._drawImageOnPage(pdfDoc, backPage, this.resources.backCoverImageBytes);
        }

        return pdfDoc.save();
    }
}