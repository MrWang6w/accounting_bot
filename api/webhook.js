process.env.NTBA_FIX_319 = 1;
// ysood@mailto.plus
require('dotenv').config();
const _ = require('lodash');
const TelegramBot = require('node-telegram-bot-api');
const { telegramConfig } = require('../server/configs');
const {
  createUid,
  selectMyAccount,
  calcStart,
  clear,
  setRate,
  checkUaddress,
  getOk,
} = require('./utils');

//获取当前时间
Date.prototype.format = function (format) {
  var args = {
    'M+': this.getMonth() + 1,
    'd+': this.getDate(),
    'h+': this.getHours(),
    'm+': this.getMinutes(),
    's+': this.getSeconds(),
    'q+': Math.floor((this.getMonth() + 3) / 3), //quarter
    S: this.getMilliseconds(),
  };
  if (/(y+)/.test(format))
    format = format.replace(
      RegExp.$1,
      (this.getFullYear() + '').substr(4 - RegExp.$1.length)
    );
  for (var i in args) {
    var n = args[i];
    if (new RegExp('(' + i + ')').test(format))
      format = format.replace(
        RegExp.$1,
        RegExp.$1.length == 1 ? n : ('00' + n).substr(('' + n).length)
      );
  }
  return format;
};
function gettime(time) {
  return new Date(
    new Date(time).getTime() +
      (parseInt(new Date(time).getTimezoneOffset() / 60) + 8) * 3600 * 1000
  );
}
const options = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '使用说明', switch_inline_query_current_chat: '使用说明' },
        {
          text: '查询实时U价格',
          switch_inline_query_current_chat: '查询实时U价格',
        },
      ],
      [
        { text: '联系客服', url: 'https://t.me/tianxiawudi777' },
        { text: '担保大群', url: 'https://t.me/tianxiawudi777' },
      ],
    ],
  },
};
module.exports = async (request, response) => {
  try {
    const { body } = request;

    if (body.message) {
      const {
        chat: { type, id, title },
        text,
        from: { username: userName, first_name, is_bot, id: chatId },
        entities,
      } = body.message;
      let outMsg = '';

      const bot = new TelegramBot(telegramConfig.token);

      const [item = {}] = entities || [];
      let at = text?.slice(item?.length || 0)?.trim();

      if (text === '使用说明' || at === '使用说明') {
        outMsg = `<i>使用说明</i>\n
<b>发送指令<pre>查询实时U价格</pre> 可查实时USDT价格</b>\n
<b>发送指令如<pre>U100</pre> 可查100UDST折合人民币价格</b>\n
<b>发送指令如<pre>CNY100</pre> 可查100人民币汇算UDST价格</b>\n
<b>发送指令<pre>清空账本</pre> 可清空记账本重新开始</b>\n
<b>发送指令+RMB如<pre>+100</pre> 使用记账加100</b>\n
<b>发送指令设置费率+费率如<pre>设置费率7.25</pre>设置当前记账费率</b>\n
<b>发送指令-RMB如<pre>-100</pre> 使用记账减100</b>\n
<b>发送指令下发U如<pre>下发100</pre> 使用记账减100u</b>\n
<b>直接发送冷钱包U地址 可查询实时余额</b>\n`;
        await bot.sendMessage(id, outMsg, {
          parse_mode: 'HTML',
          ...options,
        });
        return;
      }

      if (
        text === '查询实时U价格' ||
        at === '查询实时U价格' ||
        (text?.length === 2 && new RegExp(/\w\d/).test(text))
      ) {
        let list = await getOk();
        list = list.map(
          (x) =>
            `<strong>${x.price}</strong>   <strong>${x.nickName}</strong>\n`
        );

        outMsg = `<em>当前实时USDT价格</em>\n${list.join('')}\n`;
        await bot.sendMessage(id, outMsg, {
          parse_mode: 'HTML',
          ...options,
        });
        return;
      }

      if (text === '开始') {
        if (type === 'supergroup') {
          let [rateItem] = await getOk();
          const { code, channelTitle } = await createUid({
            chatId,
            userName,
            userChannel: id,
            userTitle: first_name,
            channelTitle: title,
            rate: +rateItem?.price,
          });
          if (code === 200) {
            outMsg = `${first_name} 您好,欢迎使用 算账机器人,你已成功注册!可以点击下方按钮查看机器人使用说明使用 `;
          } else {
            outMsg = ` ${first_name}:您已经在${channelTitle}群内注册过,请直接开始使用吧!`;
          }
        }

        if (type !== 'supergroup') {
          outMsg = `请将 @accountIng_all_in_bot 机器人拉入群组设置管理员后再进行使用`;
        }

        await bot.sendMessage(id, outMsg, options);
      }

      if (text && type === 'supergroup') {
        let reg = new RegExp(/(\+|\-|下发)/g);
        const arithmetic = text.replace(reg, '').trim();
        if (Number.isFinite(+arithmetic) && reg.test(text)) {
          const { user, account = [] } = await selectMyAccount(chatId);
          if (_.isEmpty(user)) {
            outMsg = '<strong>您还没有注册,请发送指令 开始 进行注册</strong>';
          } else {
            const { rate } = user;
            let current = {
              arithmetic: arithmetic,
              currentRate: rate,
              createTime: Date.now(),
              channel: title,
              chatId,
            };

            if (text.includes('+')) {
              current.calcMethod = '+';
            }
            if (text.includes('-')) {
              current.calcMethod = '-';
            }
            if (text.includes('下发')) {
              current.calcMethod = '下发';
            }

            await calcStart(current);
            outMsg = editMsg(account, current);
          }
          await bot.sendMessage(id, outMsg, {
            parse_mode: 'HTML',
            ...options,
          });
        }

        if (text === '清空账本') {
          await clear(chatId);
          outMsg = `<em>${first_name} 您好,您的账本已清空,感谢您的使用!</em>`;
          await bot.sendMessage(id, outMsg, {
            parse_mode: 'HTML',
            ...options,
          });
        }

        let setRatereg = new RegExp(/设置费率/);
        const rate = text.replace(setRatereg, '').trim();
        if (Number.isFinite(+rate) && setRatereg.test(text)) {
          await setRate(rate, chatId);
          outMsg = `<i>${first_name} 您已更新当前费率为 ${rate} !</i>`;
          await bot.sendMessage(id, outMsg, {
            parse_mode: 'HTML',
            ...options,
          });
        }
      }

      //查询u账号余额
      let filter = /^[a-zA-Z0-9_]{0,}$/;
      if (filter.test(text) && text?.length === 34) {
        const res = await checkUaddress(text);

        if (!_.isEmpty(res)) {
          const { trx, usdt } = res;
          outMsg = `您查询的地址 : <code>${text}</code>
目前trx余额: <code>${trx}</code>
目前usdt余额: <code>${usdt}</code>`;

          await bot.sendMessage(id, outMsg, {
            parse_mode: 'HTML',
            ...options,
          });
        }
      }

      //根据U换算人民币
      let rateReg = new RegExp(/^(U|CNY)/);
      let price = text.toLocaleUpperCase();
      let curAmount = price.replace(rateReg, '').trim();
      if (rateReg.test(price) && Number.isFinite(+curAmount)) {
        let [rateItem] = await getOk();
        if (price.includes('CNY')) {
          let calcAmount = (curAmount / rateItem.price).toFixed(2);
          outMsg = `<b>当前UDST汇率<pre>${rateItem.price}</pre></b>\n<b>${curAmount}人民币汇算成U价格: <pre>${calcAmount}U</pre></b>\n`;
        } else {
          let calcAmount = (curAmount * rateItem.price).toFixed(2);
          outMsg = `<b>当前UDST汇率<pre>${rateItem.price}</pre></b>\n<b>${curAmount}UDST折合人民币价格: <pre>${calcAmount}元</pre></b>\n`;
        }
        await bot.sendMessage(id, outMsg, {
          parse_mode: 'HTML',
          ...options,
        });
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    response.send();
  }
};

function editMsg(account, current) {
  let msg = '';
  if (!_.isEmpty(current)) {
    const { out, on, outCount, onCount } = [...account, current].reduce(
      (x, y) => {
        const { arithmetic, calcMethod, currentRate, createTime } = y;
        let curtime = gettime(createTime).format('hh:mm:ss');
        let u = (arithmetic / currentRate).toFixed(2);
        if (calcMethod === '+') {
          x.on.push(`${curtime}  ${arithmetic} / ${currentRate}= ${u}U\n`);
          x.onCount += arithmetic - 0;
        } else if (calcMethod === '-') {
          x.out.push(`${curtime}  ${u}U(实时汇率: ${currentRate}) \n`);
          x.outCount -= arithmetic - 0;
        } else {
          x.out.push(
            `${curtime} 下发${arithmetic}U(实时汇率: ${currentRate}) \n`
          );
          x.outCount -= (arithmetic * currentRate).toFixed(2);
        }
        return x;
      },
      {
        out: [],
        on: [],
        outCount: 0,
        onCount: 0,
      }
    );
    msg = `当前时间: <b>${gettime(Date.now()).format('yyyy-MM-dd hh:mm:ss')}</b>
<code>已入账(${on.length}笔):</code>
${on.join('')}
<code>已下发(${out.length}笔):</code>
${out.join('')}
  
<code>总入款金额:${onCount}</code>
<code>当前汇率:${current.currentRate}</code>
<code>应下发: ${onCount.toFixed(2)} | ${(onCount / current.currentRate).toFixed(
      2
    )}U</code>
<code>已下发: ${Math.abs(outCount).toFixed(2)} | ${(
      Math.abs(outCount) / current.currentRate
    ).toFixed(2)}U</code>
<code>未下发: ${(onCount + outCount).toFixed(2)} | ${(
      (onCount + outCount) /
      current.currentRate
    ).toFixed(2)}U</code>
<code>共计${on.length + out.length}笔</code>`;
  }

  return msg;
}
