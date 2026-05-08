# API

## Общие правила

Базовый путь backend API:

```text
/api/v1
```

Авторизованные запросы используют заголовок:

```http
Authorization: Bearer <jwt>
```

Ответы об ошибках возвращаются в формате:

```json
{
  "detail": "Описание ошибки"
}
```

## Auth

### `POST /auth/register`

Создает пользователя с ролью `client`.

Тело:

| Поле | Тип | Ограничения |
| --- | --- | --- |
| `email` | string | валидный email |
| `password` | string | 8-64 символа, минимум одна буква и одна цифра |
| `display_name` | string | до 50 символов |
| `role` | string | принимается только `client` или `dealer`, но публичная регистрация назначает `client` |
| `sub_role` | string | `PL`, `PKL`, `KL`, `KPR`, `PR` |

### `POST /auth/login`

Возвращает JWT и профиль пользователя.

### `POST /auth/google`

Обменивает Google authorization code на профиль пользователя. Ошибки OAuth не возвращают наружу технические детали.

### `GET /auth/me`

Возвращает текущего пользователя.

### `PATCH /auth/me/role`

Позволяет клиенту один раз выбрать `sub_role`, если он еще не задан. Повышение до `dealer`, `admin` или `owner` через этот endpoint запрещено.

## Orders

### `POST /orders/`

Создает заказ текущего пользователя.

Основные поля:

| Поле | Тип | Ограничения |
| --- | --- | --- |
| `product_name` | string | до 120 символов |
| `configuration` | object | JSON с параметрами изделия и контактом |
| `quantity` | integer | 1-10 000 |
| `total_price` | number | 0-1 000 000 000 |
| `currency` | string | ISO-код из 3 заглавных букв |
| `is_guest` | boolean | признак гостевого заказа |

Побочные действия:

- запрос к `renderer:3000/render`;
- сохранение render в `uploads/renders`;
- запись события в `logs`;
- публикация Kafka-события в `order_events`, если Kafka подключена.

### `GET /orders/all`

Служебный endpoint для ролей `dealer`, `admin`, `owner`.

Правила доступа:

- `admin` и `owner` видят все заказы;
- `dealer` видит только заказы, где в `configuration.productConfig.dealerId` или аналогичном поле указан его id;
- query-параметр `dealer_id` применяется только для `admin` и `owner`.

### `GET /orders/user/{user_id}`

Клиент видит только свои заказы. Администратор и владелец видят заказы любого пользователя. Дилер получает только заказы пользователя, привязанные к этому дилеру.

### `PATCH /orders/{order_id}/status`

Меняет статус заказа и добавляет запись в `stage_history`.

Тело:

```json
{
  "status": "production",
  "comment": "Комментарий до 1000 символов"
}
```

## Products

### `GET /products/`

Возвращает каталог продуктов. Можно передать `dealer_id`:

```http
GET /api/v1/products/?dealer_id=user-id
```

### `POST /products/`

Доступно `dealer`, `admin`, `owner`. Для дилера `dealerId` принудительно заменяется на id текущего пользователя.

### `PUT /products/{product_id}`

Дилер может редактировать только свои продукты. `admin` и `owner` могут редактировать любые.

### `DELETE /products/{product_id}`

Доступ аналогичен `PUT`.

## Files

### `POST /files/upload-logo`

Доступно только служебным ролям. Принимает multipart-поле `file`.

Ограничения:

- PNG, JPEG, WEBP;
- до 2 МБ;
- проверяется сигнатура файла, а не только MIME type.

## Admin

Все endpoints раздела требуют роль `admin` или `owner`.

### `GET /admin/orders`

Возвращает всю базу заказов с пагинацией.

### `GET /admin/order-types`

Возвращает список JSON-файлов типов заказов.

### `GET /admin/order-types/{type_id}`

Читает JSON-файл. `type_id` должен соответствовать шаблону:

```text
^[a-zA-Z0-9_-]{1,64}$
```

### `PUT /admin/order-types/{type_id}`

Атомарно сохраняет JSON-файл.

Тело:

```json
{
  "data": {
    "id": "notebook",
    "title": "Ежедневник"
  }
}
```

## Health

### `GET /api/health`

Проверяет соединение с базой и состояние Kafka producer.

Пример:

```json
{
  "status": "ok",
  "db": "connected",
  "kafka": "connected"
}
```

