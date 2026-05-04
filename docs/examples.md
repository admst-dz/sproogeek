# Примеры

## Регистрация клиента

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "client@example.com",
  "password": "StrongPass123",
  "display_name": "Иван",
  "role": "client",
  "sub_role": "PL"
}
```

Ответ:

```json
{
  "access_token": "jwt-token",
  "user": {
    "id": "user-id",
    "email": "client@example.com",
    "display_name": "Иван",
    "role": "client",
    "sub_role": "PL",
    "token_balance": 0
  }
}
```

## Вход

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "client@example.com",
  "password": "StrongPass123"
}
```

## Создание заказа

```http
POST /api/v1/orders/
Authorization: Bearer jwt-token
Content-Type: application/json

{
  "product_name": "Ежедневник A5",
  "configuration": {
    "productConfig": {
      "format": "A5",
      "bindingType": "spiral",
      "coverColor": "#1565C0"
    },
    "clientType": "phys",
    "contact": {
      "name": "Иван",
      "phone": "+375291234567",
      "email": "client@example.com"
    }
  },
  "quantity": 1,
  "total_price": 1500,
  "currency": "BYN",
  "is_guest": false
}
```

Backend:

- проверит JWT;
- создаст render через контейнер `renderer`;
- сохранит заказ в базе;
- запишет события `HTTP_REQUEST`, `RENDER_REQUEST_*`, `ORDER_CREATED`;
- отправит Kafka-событие `ORDER_CREATED`, если Kafka доступна.

## Получение заказов клиента

```http
GET /api/v1/orders/user/user-id
Authorization: Bearer jwt-token
```

Клиент может читать только свои заказы. Администратор и владелец могут читать заказы любого пользователя. Дилер видит только заказы, где в конфигурации указан его `dealerId`.

## Получение всех заказов администратором

```http
GET /api/v1/admin/orders?page=1&size=100
Authorization: Bearer admin-jwt-token
```

Ответ использует формат пагинации:

```json
{
  "items": [
    {
      "id": "8fc76e76-5e23-4df4-90b4-91b2c2d5d854",
      "user_id": "user-id",
      "user_email": "client@example.com",
      "product_name": "Ежедневник A5",
      "status": "new",
      "quantity": 1,
      "total_price": 1500,
      "currency": "BYN",
      "stage_history": []
    }
  ],
  "total": 1,
  "page": 1,
  "size": 100,
  "pages": 1
}
```

## Изменение статуса заказа

```http
PATCH /api/v1/orders/8fc76e76-5e23-4df4-90b4-91b2c2d5d854/status
Authorization: Bearer staff-jwt-token
Content-Type: application/json

{
  "status": "production",
  "comment": "Заказ передан в производство"
}
```

Допустимые статусы:

- `new`
- `processing`
- `production`
- `in_delivery`
- `done`

## Работа с JSON типами заказов

Список файлов:

```http
GET /api/v1/admin/order-types
Authorization: Bearer admin-jwt-token
```

Чтение файла:

```http
GET /api/v1/admin/order-types/notebook
Authorization: Bearer admin-jwt-token
```

Сохранение файла:

```http
PUT /api/v1/admin/order-types/notebook
Authorization: Bearer admin-jwt-token
Content-Type: application/json

{
  "data": {
    "id": "notebook",
    "title": "Ежедневник",
    "fields": {
      "format": {
        "type": "string",
        "required": true,
        "options": ["A5", "A4"]
      }
    }
  }
}
```

Имя файла передается без расширения `.json` и должно содержать только латинские буквы, цифры, `_` и `-`.

## Пример строки CSV-лога

```csv
timestamp,event_id,event_type,direction,actor_type,actor_id,actor_email,container,peer,method,path,status_code,latency_ms,ip,user_agent,request_id,entity_type,entity_id,description,details_json
2026-05-04T18:00:00+00:00,uuid,ORDER_CREATED,user->backend,client,user-id,client@example.com,backend,,POST,/api/v1/orders/,200,912.4,127.0.0.1,Mozilla,request-id,order,order-id,User created order,"{""product_name"":""Ежедневник A5""}"
```

## Загрузка логотипа

```http
POST /api/v1/files/upload-logo
Authorization: Bearer staff-jwt-token
Content-Type: multipart/form-data

file=@logo.png
```

Разрешены только PNG, JPEG и WEBP размером до 2 МБ. SVG и EPS отклоняются.

