import Koa from 'koa';
import cors from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import Router from '@koa/router';
import { AppError } from './utils/errors';
import buyersRouter from './routes/buyers';
import buyerPhotosRouter from './routes/buyer-photos';
import purchaseChannelsRouter from './routes/purchase-channels';
import categoriesRouter from './routes/product-categories';
import brandsRouter from './routes/brands';
import productsRouter from './routes/products';
import productModelsRouter from './routes/product-models';
import stockInOrdersRouter from './routes/stock-in-orders';
import stockOutOrdersRouter from './routes/stock-out-orders';
import inventoryRouter from './routes/inventory';
import purchasesRouter from './routes/purchases';
import salesOrdersRouter from './routes/sales-orders';
import afterSalesRouter from './routes/after-sales';
import repairOrdersRouter from './routes/repair-orders';
import serviceCardsRouter from './routes/service-cards';
import serviceOrdersRouter from './routes/service-orders';
import reportsRouter from './routes/reports';
import statsRouter from './routes/stats';
import birthdayReminderSettingsRouter from './routes/birthday-reminder-settings';
import remindersRouter from './routes/birthday-reminders';
import internalRouter from './routes/internal';

const app = new Koa();

app.use(cors());
app.use(bodyParser());

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof AppError) {
      ctx.status = err.status;
      ctx.body = { error: { code: err.code, message: err.message } };
      return;
    }
    console.error(err);
    ctx.status = 500;
    ctx.body = { error: { code: 'INTERNAL_ERROR', message: '服务器错误' } };
  }
});

const api = new Router({ prefix: '/api' });
api.use(buyersRouter.routes(), buyersRouter.allowedMethods());
api.use(buyerPhotosRouter.routes(), buyerPhotosRouter.allowedMethods());
api.use(purchaseChannelsRouter.routes(), purchaseChannelsRouter.allowedMethods());
api.use(categoriesRouter.routes(), categoriesRouter.allowedMethods());
api.use(brandsRouter.routes(), brandsRouter.allowedMethods());
api.use(productsRouter.routes(), productsRouter.allowedMethods());
api.use(productModelsRouter.routes(), productModelsRouter.allowedMethods());
api.use(stockInOrdersRouter.routes(), stockInOrdersRouter.allowedMethods());
api.use(stockOutOrdersRouter.routes(), stockOutOrdersRouter.allowedMethods());
api.use(inventoryRouter.routes(), inventoryRouter.allowedMethods());
api.use(purchasesRouter.routes(), purchasesRouter.allowedMethods());
api.use(salesOrdersRouter.routes(), salesOrdersRouter.allowedMethods());
api.use(afterSalesRouter.routes(), afterSalesRouter.allowedMethods());
api.use(repairOrdersRouter.routes(), repairOrdersRouter.allowedMethods());
api.use(serviceCardsRouter.routes(), serviceCardsRouter.allowedMethods());
api.use(serviceOrdersRouter.routes(), serviceOrdersRouter.allowedMethods());
api.use(reportsRouter.routes(), reportsRouter.allowedMethods());
api.use(statsRouter.routes(), statsRouter.allowedMethods());
api.use(birthdayReminderSettingsRouter.routes(), birthdayReminderSettingsRouter.allowedMethods());
api.use(remindersRouter.routes(), remindersRouter.allowedMethods());
api.use(internalRouter.routes(), internalRouter.allowedMethods());

app.use(api.routes()).use(api.allowedMethods());

app.use(async (ctx) => {
  if (ctx.path === '/health') {
    ctx.body = { ok: true };
  }
});

export default app;
